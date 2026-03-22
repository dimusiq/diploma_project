"""Автопостановка act в очередь pending при ответе requires_confirmation."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session, select

from app.agent.tool_safety import ToolSafetyClass
from app.core.config import settings
from app.models import AgentPendingAction, User


def _args_match(a: dict[str, Any], b: dict[str, Any]) -> bool:
    return json.dumps(a, sort_keys=True, default=str) == json.dumps(
        b, sort_keys=True, default=str
    )


def maybe_create_auto_pending(
    session: Session,
    *,
    user: User,
    tool_name: str,
    arguments: dict[str, Any],
    tool_output: str,
    safety: ToolSafetyClass | str,
    ctx: Any,
) -> None:
    if not bool(getattr(settings, "AGENT_AUTO_PENDING_ACTIONS", True)):
        return
    sval = safety.value if isinstance(safety, ToolSafetyClass) else str(safety)
    if sval != ToolSafetyClass.ACT.value:
        return
    try:
        data = json.loads(tool_output)
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict) or not data.get("requires_confirmation"):
        return
    if ctx is None:
        return
    run_uuid: uuid.UUID | None = None
    try:
        run_uuid = uuid.UUID(str(ctx.run_id))
    except (ValueError, TypeError):
        run_uuid = None

    stmt = select(AgentPendingAction).where(
        AgentPendingAction.user_id == user.id,
        AgentPendingAction.tool_name == tool_name,
        AgentPendingAction.status == "pending",
    )
    for row in session.exec(stmt).all():
        if isinstance(row.arguments, dict) and _args_match(row.arguments, arguments):
            return

    row = AgentPendingAction(
        user_id=user.id,
        agent_run_id=run_uuid,
        tool_name=tool_name,
        arguments=dict(arguments),
        rationale="auto:requires_confirmation",
        status="pending",
        source="auto",
        created_at=datetime.now(timezone.utc),
    )
    session.add(row)
    session.flush()
