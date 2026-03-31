import uuid
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from redis.exceptions import ConnectionError as RedisConnectionError

from app.core.config import settings
from app.services.agent_rate_limit import (
    enforce_agent_chat_rate_limit,
    get_agent_rate_limit_degraded_total,
)


def test_redis_failover_degrades_to_memory(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "REDIS_URL", "redis://127.0.0.1:63999")
    monkeypatch.setattr(settings, "AGENT_RL_REDIS_FAILOVER", "memory")
    monkeypatch.setattr(settings, "AGENT_CHAT_RATE_LIMIT_PER_MINUTE", 30)
    uid = uuid.uuid4()
    before = get_agent_rate_limit_degraded_total()
    with patch(
        "app.services.agent_rate_limit.redis.from_url",
        side_effect=RedisConnectionError("simulated redis down"),
    ):
        enforce_agent_chat_rate_limit(uid)
    assert get_agent_rate_limit_degraded_total() == before + 1


def test_redis_failover_reject_returns_503(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "REDIS_URL", "redis://127.0.0.1:63999")
    monkeypatch.setattr(settings, "AGENT_RL_REDIS_FAILOVER", "reject")
    monkeypatch.setattr(settings, "AGENT_CHAT_RATE_LIMIT_PER_MINUTE", 30)
    uid = uuid.uuid4()
    with patch(
        "app.services.agent_rate_limit.redis.from_url",
        side_effect=RedisConnectionError("simulated redis down"),
    ):
        with pytest.raises(HTTPException) as ei:
            enforce_agent_chat_rate_limit(uid)
    assert ei.value.status_code == 503
    assert isinstance(ei.value.detail, dict)
    assert ei.value.detail.get("error_code") == "agent_rate_limit_backend_unavailable"
