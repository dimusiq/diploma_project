"""
Tool Registry: каталог из `tool_catalog`, права, аудит вызова, делегирование в `run_agent_tool`.

Зависимости от app.services — только внутри invoke_tool (lazy), чтобы не замыкать
agent/ ↔ services/ на import-time.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlmodel import Session

from app.agent.tool_audit_log import log_tool_run
from app.agent.tool_catalog import CATALOG_BY_NAME, openai_tools_for_user
from app.agent.tool_safety import AgentToolContext
from app.agent.trace import AgentTrace
from app.core.permissions import (
    PERM_INTEGRATIONS_INBOX_WRITE,
    can_read_audit,
    can_view_maintenance_schedule,
    user_has_permission,
)
from app.models import User

logger = logging.getLogger(__name__)


def llm_tools_payload(session: Session, user: User) -> list[dict[str, Any]]:
    """Схемы tools для OpenAI-совместимого chat (vLLM и т.д.)."""
    return openai_tools_for_user(
        is_superuser=bool(user.is_superuser),
        has_audit_read=can_read_audit(session, user),
        has_inbox_write=user_has_permission(
            session, user, PERM_INTEGRATIONS_INBOX_WRITE
        ),
        has_maintenance_schedule_view=can_view_maintenance_schedule(session, user),
    )


def can_run_tool(session: Session, user: User, tool_name: str) -> bool:
    spec = CATALOG_BY_NAME.get(tool_name)
    if not spec:
        return False
    if not user_has_permission(session, user, spec.permission_code):
        return False
    if spec.requires_audit_read and not can_read_audit(session, user):
        return False
    if spec.superuser_only and not user.is_superuser:
        return False
    if spec.requires_inbox_write and not user_has_permission(
        session, user, PERM_INTEGRATIONS_INBOX_WRITE
    ):
        return False
    if spec.requires_maintenance_schedule_view and not can_view_maintenance_schedule(
        session, user
    ):
        return False
    return True


def _record_denial(
    *,
    reason: str,
    tool_name: str,
    detail: str,
    ctx: AgentToolContext | None,
    trace: AgentTrace | None,
) -> None:
    logger.warning(
        "agent_tool_denied reason=%s tool=%s detail=%s run_id=%s",
        reason,
        tool_name,
        detail[:240],
        getattr(ctx, "run_id", None),
    )
    if trace is not None:
        trace.add_step(
            "policy_denied",
            reason=reason,
            tool=tool_name,
            detail=detail[:240],
        )


def invoke_tool(
    session: Session,
    user: User,
    tool_name: str,
    raw_arguments: str,
    *,
    ctx: AgentToolContext | None = None,
    trace: AgentTrace | None = None,
) -> str:
    """
    Вызов инструмента с обязательной проверкой прав и политики.

    Параметр allow_when_route_checked удалён: обход can_run_tool больше невозможен.
    """
    # Lazy: разрыв import-cycle agent.tool_registry ↔ services.*
    from app.services.agent_pending_auto import maybe_create_auto_pending
    from app.services.agent_policy_engine import policy_denial_json
    from app.services.agent_tools import parse_tool_arguments, run_agent_tool

    spec = CATALOG_BY_NAME.get(tool_name)
    if not spec:
        return json.dumps(
            {"error": f"Неизвестный инструмент: {tool_name}"}, ensure_ascii=False
        )
    if not can_run_tool(session, user, tool_name):
        msg = "Недостаточно прав для вызова инструмента"
        _record_denial(
            reason="permission",
            tool_name=tool_name,
            detail=msg,
            ctx=ctx,
            trace=trace,
        )
        return json.dumps({"error": msg}, ensure_ascii=False)
    denied = policy_denial_json(session, user, tool_name, spec, ctx)
    if denied is not None:
        try:
            detail = json.loads(denied).get("detail") or "policy_denied"
        except json.JSONDecodeError:
            detail = "policy_denied"
        _record_denial(
            reason="policy",
            tool_name=tool_name,
            detail=str(detail),
            ctx=ctx,
            trace=trace,
        )
        return denied
    args = parse_tool_arguments(raw_arguments)
    out = run_agent_tool(session, user, tool_name, args, ctx)
    if ctx is not None:
        log_tool_run(
            run_id=ctx.run_id,
            actor_user_id=ctx.actor_user_id,
            tool_name=tool_name,
            safety=spec.safety,
            tool_input=raw_arguments,
            tool_output=out,
        )
        maybe_create_auto_pending(
            session,
            user=user,
            tool_name=tool_name,
            arguments=args,
            tool_output=out,
            safety=spec.safety,
            ctx=ctx,
        )
    return out


def tool_versions_snapshot() -> dict[str, str]:
    return {name: t.version for name, t in CATALOG_BY_NAME.items()}
