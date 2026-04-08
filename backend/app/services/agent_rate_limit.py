"""Ограничение частоты запросов к ассистенту: Redis (фикс. окно) или память процесса."""

from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import defaultdict, deque

import redis
from fastapi import HTTPException
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)

_LOCK = threading.Lock()
_MEMORY_HITS: dict[str, deque[float]] = defaultdict(deque)
_WINDOW_SEC = 60.0

_RL_DEGRADED_LOCK = threading.Lock()
_AGENT_RATE_LIMIT_DEGRADED_TOTAL = 0


def get_agent_rate_limit_degraded_total() -> int:
    """Счётчик переключений на fallback при сбое Redis (для метрик / тестов)."""
    with _RL_DEGRADED_LOCK:
        return _AGENT_RATE_LIMIT_DEGRADED_TOTAL


def _bump_agent_rate_limit_degraded() -> None:
    global _AGENT_RATE_LIMIT_DEGRADED_TOTAL
    with _RL_DEGRADED_LOCK:
        _AGENT_RATE_LIMIT_DEGRADED_TOTAL += 1


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


_redis_pool: redis.ConnectionPool | None = None
_redis_pool_lock = threading.Lock()


def _get_redis_pool() -> redis.ConnectionPool:
    global _redis_pool
    if _redis_pool is None:
        with _redis_pool_lock:
            if _redis_pool is None:
                _redis_pool = redis.ConnectionPool.from_url(
                    settings.REDIS_URL, decode_responses=True  # type: ignore[arg-type]
                )
    return _redis_pool


def _enforce_redis(user_id: uuid.UUID, limit: int) -> None:
    if not settings.REDIS_URL:
        _enforce_memory(user_id, limit)
        return
    minute_bucket = int(time.time()) // 60
    key = f"agent:chat:rl:{user_id}:{minute_bucket}"
    try:
        r = redis.Redis(connection_pool=_get_redis_pool())
        n = r.incr(key)
        if n == 1:
            r.expire(key, 120)
        if n > limit:
            raise HTTPException(
                status_code=429,
                detail="Слишком много запросов к ассистенту. Подождите минуту.",
            )
    except RedisError:
        _bump_agent_rate_limit_degraded()
        logger.warning(
            "agent_rate_limit_redis_failed metric=agent_rate_limit_degraded_total "
            "failover=%s user_id=%s",
            settings.AGENT_RL_REDIS_FAILOVER,
            user_id,
            exc_info=True,
        )
        if settings.AGENT_RL_REDIS_FAILOVER == "reject":
            raise HTTPException(
                status_code=503,
                detail={
                    "error_code": "agent_rate_limit_backend_unavailable",
                    "message": "Сервис ограничения частоты временно недоступен. Повторите позже.",
                    "retryable": True,
                },
            ) from None
        _enforce_memory(user_id, limit)


def enforce_agent_chat_rate_limit(user_id: uuid.UUID) -> None:
    limit = settings.AGENT_CHAT_RATE_LIMIT_PER_MINUTE
    if limit <= 0:
        return
    if settings.REDIS_URL:
        _enforce_redis(user_id, limit)
    else:
        _enforce_memory(user_id, limit)
