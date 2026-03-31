"""Жёсткое решение: нужен ли вызов инструмента (для tool_choice=required)."""

from __future__ import annotations

from app.core.config import settings

_DEFAULT_TRIGGERS = (
    "сколько",
    "количество",
    "остатки",
    "остаток",
    "статус",
    "техника",
    "заказы",
    "заказ",
    "sku",
    "позици",
    "ячейк",
    "задач",
    "моточас",
    "просроч",
)


def must_use_tool(question: str) -> bool:
    if not bool(getattr(settings, "AGENT_MUST_USE_TOOL_ENABLED", True)):
        return False
    q = (question or "").lower()
    return any(t in q for t in _DEFAULT_TRIGGERS)
