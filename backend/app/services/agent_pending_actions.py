"""Выполнение отложенных act-инструментов после явного approve (superuser, без sandbox)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session

from app.agent.tool_catalog import CATALOG_BY_NAME
from app.agent.tool_registry import invoke_tool
from app.agent.tool_safety import AgentToolContext, ToolSafetyClass
from app.core.config import settings
from app.models import AgentPendingAction, User


def execute_pending_action(
    session: Session,
    *,
    actor: User,
    pending_id: uuid.UUID,
) -> tuple[AgentPendingAction, str]:
    if not actor.is_superuser:
        raise HTTPException(status_code=403, detail="Только суперпользователь может выполнить действие")
    if bool(getattr(settings, "AGENT_SANDBOX_MODE", True)):
        raise HTTPException(
            status_code=409,
            detail="AGENT_SANDBOX_MODE включён: отложенное выполнение act заблокировано",
        )
    row = session.get(AgentPendingAction, pending_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail=f"Статус не pending: {row.status}")
    spec = CATALOG_BY_NAME.get(row.tool_name)
    if spec is None or spec.safety != ToolSafetyClass.ACT:
        raise HTTPException(
            status_code=400,
            detail="Разрешены только зарегистрированные act-инструменты",
        )
    ctx = AgentToolContext(
        run_id=str(uuid.uuid4()),
        actor_user_id=actor.id,
        sandbox=False,
        allow_mutating_tools=True,
        is_superuser=True,
    )
    raw = json.dumps(row.arguments, ensure_ascii=False)
    try:
        out = invoke_tool(session, actor, row.tool_name, raw, ctx=ctx)
    except Exception as e:
        row.status = "failed"
        row.resolved_at = datetime.now(timezone.utc)
        row.resolved_by_user_id = actor.id
        row.result_preview = str(e)[:2000]
        session.add(row)
        session.commit()
        session.refresh(row)
        raise HTTPException(
            status_code=502,
            detail=f"Ошибка выполнения инструмента: {e!s}",
        ) from e
    row.status = "executed"
    row.resolved_at = datetime.now(timezone.utc)
    row.resolved_by_user_id = actor.id
    row.result_preview = out[:2000]
    session.add(row)
    session.commit()
    session.refresh(row)
    return row, out
