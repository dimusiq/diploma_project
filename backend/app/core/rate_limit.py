"""Rate limiting for login: Redis when REDIS_URL is set, else in-process memory."""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from threading import Lock

import redis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)

_login_attempts: dict[str, list[float]] = defaultdict(list)
_lock = Lock()
LOGIN_MAX_PER_MINUTE = 10
WINDOW_SECONDS = 60

_redis_pool: redis.ConnectionPool | None = None
_redis_pool_lock = Lock()


def _prune(old: list[float], window: float) -> list[float]:
    now = time.monotonic()
    return [t for t in old if now - t < window]


def _get_redis_pool() -> redis.ConnectionPool | None:
    global _redis_pool
    url = settings.REDIS_URL
    if not url:
        return None
    if _redis_pool is None:
        with _redis_pool_lock:
            if _redis_pool is None:
                _redis_pool = redis.ConnectionPool.from_url(
                    url, decode_responses=True
                )
    return _redis_pool


def _check_redis(key: str) -> bool | None:
    pool = _get_redis_pool()
    if pool is None:
        return None
    minute_bucket = int(time.time()) // 60
    rkey = f"login:rl:{key}:{minute_bucket}"
    r = redis.Redis(connection_pool=pool)
    n = r.incr(rkey)
    if n == 1:
        r.expire(rkey, 120)
    return n <= LOGIN_MAX_PER_MINUTE


def _check_memory(key: str) -> bool:
    with _lock:
        now = time.monotonic()
        pruned = _prune(_login_attempts[key], WINDOW_SECONDS)
        if len(pruned) >= LOGIN_MAX_PER_MINUTE:
            _login_attempts[key] = pruned
            return False
        pruned.append(now)
        _login_attempts[key] = pruned
        return True


def check_login_rate_limit(identifier: str) -> bool:
    """
    Returns True if the request is allowed, False if rate limit exceeded.
    Call this before processing login; if False, return 429.
    """
    key = identifier.strip() or "unknown"
    if settings.REDIS_URL:
        try:
            allowed = _check_redis(key)
            if allowed is not None:
                return allowed
        except RedisError:
            logger.warning("login_rate_limit_redis_failed key=%s", key, exc_info=True)
    return _check_memory(key)


def reset_login_rate_limit() -> None:
    with _lock:
        _login_attempts.clear()
