from app.core.rate_limit import (
    LOGIN_MAX_PER_MINUTE,
    check_login_rate_limit,
    reset_login_rate_limit,
)


def test_login_rate_limit_allows_then_blocks() -> None:
    reset_login_rate_limit()
    key = "test-ip-rate-limit"
    for _ in range(LOGIN_MAX_PER_MINUTE):
        assert check_login_rate_limit(key) is True
    assert check_login_rate_limit(key) is False
