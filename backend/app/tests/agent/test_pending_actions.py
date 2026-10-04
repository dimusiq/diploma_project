"""Отложенные act (pending-actions): RBAC, sandbox, статусы."""

from __future__ import annotations

import json
import uuid
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.agent.contracts import ToolSafetyClass
from app.core.config import settings
from app.models import AgentPendingAction
from app.services.agent_pending_actions import execute_pending_action


def _actor(*, superuser: bool) -> MagicMock:
    u = MagicMock()
    u.id = uuid.uuid4()
    u.is_superuser = superuser
    return u


def test_pending_requires_superuser() -> None:
    with pytest.raises(HTTPException) as ei:
        execute_pending_action(
            MagicMock(), actor=_actor(superuser=False), pending_id=uuid.uuid4()
        )
    assert ei.value.status_code == 403


def test_pending_blocked_when_sandbox_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "AGENT_SANDBOX_MODE", True)
    with pytest.raises(HTTPException) as ei:
        execute_pending_action(
            MagicMock(), actor=_actor(superuser=True), pending_id=uuid.uuid4()
        )
    assert ei.value.status_code == 409


def test_pending_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "AGENT_SANDBOX_MODE", False)
    session = MagicMock()
    session.get.return_value = None
    with pytest.raises(HTTPException) as ei:
        execute_pending_action(
            session, actor=_actor(superuser=True), pending_id=uuid.uuid4()
        )
    assert ei.value.status_code == 404


def test_pending_rejects_non_pending_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "AGENT_SANDBOX_MODE", False)
    row = MagicMock(spec=AgentPendingAction)
    row.status = "executed"
    session = MagicMock()
    session.get.return_value = row
    with pytest.raises(HTTPException) as ei:
        execute_pending_action(
            session, actor=_actor(superuser=True), pending_id=uuid.uuid4()
        )
    assert ei.value.status_code == 409


def test_pending_rejects_non_act_tool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "AGENT_SANDBOX_MODE", False)
    row = MagicMock(spec=AgentPendingAction)
    row.status = "pending"
    row.tool_name = "get_inventory_summary"
    session = MagicMock()
    session.get.return_value = row
    with pytest.raises(HTTPException) as ei:
        execute_pending_action(
            session, actor=_actor(superuser=True), pending_id=uuid.uuid4()
        )
    assert ei.value.status_code == 400


def test_pending_executes_act_and_marks_executed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "AGENT_SANDBOX_MODE", False)
    pid = uuid.uuid4()
    row = MagicMock(spec=AgentPendingAction)
    row.status = "pending"
    row.tool_name = "create_transfer_task"
    row.arguments = {"sku": "A"}
    row.id = pid

    session = MagicMock()
    session.get.return_value = row

    spec = MagicMock()
    spec.safety = ToolSafetyClass.ACT
    monkeypatch.setattr(
        "app.agent.tool_catalog.CATALOG_BY_NAME",
        {"create_transfer_task": spec},
        raising=False,
    )
    # CATALOG_BY_NAME is imported into pending_actions module namespace at call time
    # via tool_catalog — patch the lookup used inside execute_pending_action.
    monkeypatch.setattr(
        "app.services.agent_pending_actions.CATALOG_BY_NAME",
        {"create_transfer_task": spec},
    )

    def fake_invoke(*_a: object, **_k: object) -> str:
        return json.dumps({"ok": True, "task_id": "t1"})

    monkeypatch.setattr(
        "app.agent.tool_registry.invoke_tool",
        fake_invoke,
    )

    out_row, out_json = execute_pending_action(
        session, actor=_actor(superuser=True), pending_id=pid
    )
    assert out_row.status == "executed"
    assert "task_id" in out_json
    session.commit.assert_called()
