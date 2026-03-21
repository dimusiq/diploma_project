"""Диспетчер инструментов агента: вызов обработчиков из `agent_tools_handlers`."""

from __future__ import annotations

import json
from typing import Any

from sqlmodel import Session

from app.agent.tool_safety import AgentToolContext
from app.models import User
from app.services.agent_tools_handlers import HANDLERS


def parse_tool_arguments(raw: str) -> dict[str, Any]:
    if not raw or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def run_agent_tool(
    session: Session,
    user: User,
    name: str,
    arguments: dict[str, Any],
    ctx: AgentToolContext | None = None,
) -> str:
    fn = HANDLERS.get(name)
    if not fn:
        return json.dumps({"error": f"Неизвестный инструмент: {name}"}, ensure_ascii=False)
    return fn(session, user, arguments, ctx)


# Обратная совместимость: пустой список; OpenAI-схемы берутся из `app.agent.tool_catalog`.
TOOL_DEFINITIONS: list[dict[str, Any]] = []
