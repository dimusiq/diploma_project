"""Общие хелперы обработчиков инструментов агента."""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlmodel import Session, select

from app.agent.contracts import AgentToolContext, ToolSafetyClass
from app.core.permissions import can_see_all_items
from app.models import Item, User, Warehouse


def _json(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)

def _default_warehouse_id(session: Session) -> uuid.UUID | None:
    w = session.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if w:
        return w.id
    any_w = session.exec(select(Warehouse).limit(1)).first()
    return any_w.id if any_w else None

def _item_scope(session: Session, user: User):
    stmt = select(Item)
    if not can_see_all_items(session, user):
        stmt = stmt.where(Item.owner_id == user.id)
    return stmt

def _act_gate(
    ctx: AgentToolContext | None,
    *,
    tool_name: str,
    payload: dict[str, Any],
    superuser_only: bool = False,
) -> str | None:
    """Возвращает JSON-ответ, если выполнять act нельзя; иначе None."""
    if ctx is None:
        return _json(
            {
                "error": "internal_error",
                "detail": "Отсутствует контекст выполнения инструментов",
            }
        )
    if superuser_only and not ctx.is_superuser:
        return _json(
            {
                "requires_confirmation": True,
                "superuser_only": True,
                "tool": tool_name,
                "message": "Инструмент доступен только суперпользователю",
            }
        )
    if ctx.sandbox:
        return _json(
            {
                "sandbox": True,
                "tool": tool_name,
                "safety": ToolSafetyClass.ACT.value,
                "payload": payload,
                "message": "Режим sandbox: запись в БД не выполнялась",
            }
        )
    if not ctx.can_execute_act():
        return _json(
            {
                "requires_confirmation": True,
                "tool": tool_name,
                "safety": ToolSafetyClass.ACT.value,
                "payload": payload,
                "message": (
                    "Действие не выполнено. Нужно явное подтверждение в UI: "
                    "запрос с allow_mutating_tools=true (только суперпользователь, sandbox выключен)."
                ),
                "compensation_hint": "Повторный вызов с подтверждением или отмена в интерфейсе склада",
            }
        )
    return None

