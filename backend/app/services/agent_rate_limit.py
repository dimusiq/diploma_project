"""Ограничение частоты запросов к ассистенту: Redis (фикс. окно) или память процесса."""

from __future__ import annotations

import threading
import time
import uuid
from collections import defaultdict, deque

import redis
from fastapi import HTTPException

from app.core.config import settings

_LOCK = threading.Lock()
_MEMORY_HITS: dict[str, deque[float]] = defaultdict(deque)
_WINDOW_SEC = 60.0


def _enforce_memory(user_id: uuid.UUID, limit: int) -> None:
    now = time.monotonic()
    key = str(user_id)
    with _LOCK:
        dq = _MEMORY_HITS[key]
        while dq and dq[0] < now - _WINDOW_SEC:
            dq.popleft()
        if len(dq) >= limit:
            raise HTTPException(
                status_code=429,
                detail="Слишком много запросов к ассистенту. Подождите минуту.",
            )
        dq.append(now)


def _enforce_redis(user_id: uuid.UUID, limit: int) -> None:
    assert settings.REDIS_URL
    minute_bucket = int(time.time()) // 60
    key = f"agent:chat:rl:{user_id}:{minute_bucket}"
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    n = r.incr(key)
    if n == 1:
        r.expire(key, 120)
    if n > limit:
        raise HTTPException(
            status_code=429,
            detail="Слишком много запросов к ассистенту. Подождите минуту.",
        )


def enforce_agent_chat_rate_limit(user_id: uuid.UUID) -> None:
    limit = settings.AGENT_CHAT_RATE_LIMIT_PER_MINUTE
    if limit <= 0:
        return
    if settings.REDIS_URL:
        _enforce_redis(user_id, limit)
    else:
        _enforce_memory(user_id, limit)
