"""In-memory rate limiting for login and sensitive endpoints."""
import time
from collections import defaultdict
from threading import Lock

# (ip -> list of timestamps in last window)
_login_attempts: dict[str, list[float]] = defaultdict(list)
_lock = Lock()
LOGIN_MAX_PER_MINUTE = 10
WINDOW_SECONDS = 60


def _prune(old: list[float], window: float) -> list[float]:
    now = time.monotonic()
    return [t for t in old if now - t < window]


def check_login_rate_limit(identifier: str) -> bool:
    """
    Returns True if the request is allowed, False if rate limit exceeded.
    Call this before processing login; if False, return 429.
    """
    with _lock:
        key = identifier.strip() or "unknown"
        now = time.monotonic()
        _login_attempts[key] = _prune(_login_attempts[key], WINDOW_SECONDS)
        if not _login_attempts[key]:
            del _login_attempts[key]
            _login_attempts[key] = []
        if len(_login_attempts[key]) >= LOGIN_MAX_PER_MINUTE:
            return False
        _login_attempts[key].append(now)
        return True
