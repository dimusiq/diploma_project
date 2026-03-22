"""
Интерпретация записей AgentPolicy (code=tool_execution) перед вызовом инструментов.

Схема rules (JSON), объединяется с дефолтами:
- deny_tools: list[str] — полный запрет имени инструмента
- allow_act_tools: list[str] | null — если непустой список, реальные act (не sandbox) только из списка
- act_requires_superuser: bool — при реальном act без sandbox только суперпользователь
- block_connector_enqueue: bool — запрет enqueue_integration_inbox
"""

from __future__ import annotations

import json
from typing import Any

from sqlmodel import Session, select

from app.agent.tool_catalog import CatalogTool
from app.agent.tool_safety import AgentToolContext, ToolSafetyClass
from app.models import AgentPolicy, User

DEFAULT_TOOL_POLICY: dict[str, Any] = {
    "sandbox_default": True,
    "act_requires_superuser": True,
    "act_requires_client_flag": True,
    "deny_tools": [],
    "allow_act_tools": None,
    "block_connector_enqueue": False,
}


def load_tool_execution_policy(session: Session) -> dict[str, Any]:
    out = dict(DEFAULT_TOOL_POLICY)
    row = session.exec(select(AgentPolicy).where(AgentPolicy.code == "tool_execution")).first()
    if row is not None and isinstance(row.rules, dict):
        out.update(row.rules)
    return out


def policy_denial_message(
    session: Session,
    user: User,
    tool_name: str,
    spec: CatalogTool,
    ctx: AgentToolContext | None,
) -> str | None:
    """Если инструмент запрещён политикой, вернуть короткое сообщение; иначе None."""
    from app.core.config import settings

    if not bool(getattr(settings, "AGENT_POLICY_ENFORCE", True)):
        return None
    pol = load_tool_execution_policy(session)
    deny = pol.get("deny_tools")
    if isinstance(deny, list) and tool_name in deny:
        return "Инструмент в списке deny_tools политики tool_execution"

    if tool_name == "enqueue_integration_inbox" and pol.get("block_connector_enqueue"):
        return "Запись во входящую очередь интеграций отключена политикой"

    if spec.safety != ToolSafetyClass.ACT:
        return None

    real_act = bool(
        ctx is not None and ctx.can_execute_act() and not ctx.sandbox
    )
    if not real_act:
        return None

    if pol.get("act_requires_superuser") and not user.is_superuser:
        return "Реальные act-операции разрешены только суперпользователю (политика)"

    allow_list = pol.get("allow_act_tools")
    if isinstance(allow_list, list) and len(allow_list) > 0 and tool_name not in allow_list:
        return "Инструмент не входит в allow_act_tools политики"

    return None


def policy_denial_json(session: Session, user: User, tool_name: str, spec: CatalogTool, ctx: Any) -> str | None:
    msg = policy_denial_message(session, user, tool_name, spec, ctx)
    if msg is None:
        return None
    return json.dumps({"error": "policy_denied", "detail": msg}, ensure_ascii=False)
