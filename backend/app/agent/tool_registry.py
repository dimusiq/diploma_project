"""
Tool Registry: каталог из `tool_catalog`, права, аудит вызова, делегирование в `run_agent_tool`.
"""

from __future__ import annotations

import json
from typing import Any

from sqlmodel import Session

from app.agent.tool_audit_log import log_tool_run
from app.agent.tool_catalog import CATALOG_BY_NAME, openai_tools_for_user
from app.agent.tool_safety import AgentToolContext
from app.core.permissions import (
    PERM_INTEGRATIONS_INBOX_WRITE,
    can_read_audit,
    can_view_maintenance_schedule,
    user_has_permission,
)
from app.models import User
from app.services.agent_pending_auto import maybe_create_auto_pending
from app.services.agent_policy_engine import policy_denial_json
from app.services.agent_tools import parse_tool_arguments, run_agent_tool


def llm_tools_payload(session: Session, user: User) -> list[dict[str, Any]]:
    """Схемы tools для OpenAI-совместимого chat (vLLM и т.д.)."""
    return openai_tools_for_user(
        is_superuser=bool(user.is_superuser),
        has_audit_read=can_read_audit(session, user),
        has_inbox_write=user_has_permission(session, user, PERM_INTEGRATIONS_INBOX_WRITE),
        has_maintenance_schedule_view=can_view_maintenance_schedule(session, user),
    )


def ollama_tools_payload(session: Session, user: User) -> list[dict[str, Any]]:
    """Устаревшее имя: см. llm_tools_payload."""
    return llm_tools_payload(session, user)


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


def invoke_tool(
    session: Session,
    user: User,
    tool_name: str,
    raw_arguments: str,
    *,
    ctx: AgentToolContext | None = None,
    allow_when_route_checked: bool = True,
) -> str:
    spec = CATALOG_BY_NAME.get(tool_name)
    if not spec:
        return json.dumps({"error": f"Неизвестный инструмент: {tool_name}"}, ensure_ascii=False)
    if allow_when_route_checked and not can_run_tool(session, user, tool_name):
        return json.dumps(
            {"error": "Недостаточно прав для вызова инструмента"},
            ensure_ascii=False,
        )
    denied = policy_denial_json(session, user, tool_name, spec, ctx)
    if denied is not None:
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
