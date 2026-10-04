"""Policy / sandbox / pending-gate: act не пишет в БД в sandbox."""

from __future__ import annotations

import json
import uuid
from unittest.mock import MagicMock

import pytest

from app.agent.contracts import AgentToolContext, ToolSafetyClass
from app.agent.tool_catalog import CATALOG_BY_NAME
from app.agent.tool_force_router import detect_tool_topics, must_use_tool
from app.agent.tool_registry import invoke_tool
from app.agent.trace import AgentTrace
from app.models import IntegrationInbox
from app.services.agent_tools_act import handle_enqueue_integration_inbox
from app.services.agent_tools_common import _act_gate


def _ctx(*, sandbox: bool, allow: bool = False, superuser: bool = True) -> AgentToolContext:
    return AgentToolContext(
        run_id=str(uuid.uuid4()),
        actor_user_id=uuid.uuid4(),
        sandbox=sandbox,
        allow_mutating_tools=allow,
        is_superuser=superuser,
    )


def test_enqueue_is_act_in_catalog() -> None:
    spec = CATALOG_BY_NAME["enqueue_integration_inbox"]
    assert spec.safety == ToolSafetyClass.ACT


def test_act_gate_blocks_sandbox() -> None:
    gated = _act_gate(
        _ctx(sandbox=True),
        tool_name="enqueue_integration_inbox",
        payload={"source": "wms"},
    )
    assert gated is not None
    data = json.loads(gated)
    assert data.get("sandbox") is True


def test_enqueue_sandbox_does_not_touch_session() -> None:
    session = MagicMock()
    out = handle_enqueue_integration_inbox(
        session,
        MagicMock(),
        {
            "source": "wms",
            "event_type": "test.event",
            "payload": {"a": 1},
        },
        _ctx(sandbox=True),
    )
    data = json.loads(out)
    assert data.get("sandbox") is True
    session.add.assert_not_called()
    session.commit.assert_not_called()


def test_enqueue_requires_confirmation_without_allow() -> None:
    session = MagicMock()
    out = handle_enqueue_integration_inbox(
        session,
        MagicMock(),
        {
            "source": "wms",
            "event_type": "test.event",
            "payload": {"a": 1},
        },
        _ctx(sandbox=False, allow=False, superuser=True),
    )
    data = json.loads(out)
    assert data.get("requires_confirmation") is True
    session.add.assert_not_called()


def test_invoke_tool_permission_denial_in_trace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock()
    user = MagicMock()
    user.is_superuser = False
    trace = AgentTrace.new()
    monkeypatch.setattr(
        "app.agent.tool_registry.can_run_tool", lambda *_a, **_k: False
    )
    out = invoke_tool(
        session,
        user,
        "get_inventory_summary",
        "{}",
        ctx=_ctx(sandbox=True),
        trace=trace,
    )
    data = json.loads(out)
    assert "прав" in data.get("error", "").lower()
    assert any(s.get("phase") == "policy_denied" for s in trace.steps)


def test_invoke_tool_policy_denial_in_trace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock()
    user = MagicMock()
    user.is_superuser = True
    trace = AgentTrace.new()
    monkeypatch.setattr(
        "app.agent.tool_registry.can_run_tool", lambda *_a, **_k: True
    )
    monkeypatch.setattr(
        "app.services.agent_policy_engine.policy_denial_json",
        lambda *_a, **_k: json.dumps(
            {"error": "policy_denied", "detail": "deny_tools"}, ensure_ascii=False
        ),
    )
    out = invoke_tool(
        session,
        user,
        "get_inventory_summary",
        "{}",
        ctx=_ctx(sandbox=True),
        trace=trace,
    )
    data = json.loads(out)
    assert data.get("error") == "policy_denied"
    assert any(
        s.get("phase") == "policy_denied" and s.get("reason") == "policy"
        for s in trace.steps
    )


def test_detect_tool_topics_aligned_with_must_use() -> None:
    assert "equipment" in detect_tool_topics("Сколько единиц техники на складе?")
    assert must_use_tool("Сколько единиц техники на складе?") is True
    assert must_use_tool("привет") is False


def test_sandbox_blocks_all_catalog_act_tools() -> None:
    """Каждый ACT из каталога в sandbox получает gate (без записи в БД)."""
    ctx = _ctx(sandbox=True)
    act_names = [n for n, s in CATALOG_BY_NAME.items() if s.safety == ToolSafetyClass.ACT]
    assert "enqueue_integration_inbox" in act_names
    for name in act_names:
        gated = _act_gate(ctx, tool_name=name, payload={"probe": True})
        assert gated is not None, name
        assert json.loads(gated).get("sandbox") is True


def test_integration_inbox_tablename() -> None:
    assert IntegrationInbox.__tablename__ == "integration_inbox"
