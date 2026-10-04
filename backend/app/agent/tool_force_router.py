"""
Единый источник правды: какие вопросы требуют инструмента / какие темы читать.

Боевой контур — LLM tool_calls + must_use_tool (tool_choice=required при флаге).
Code-оркестратор (AGENT_CODE_ORCHESTRATION) — тонкий адаптер над detect_tool_topics.
"""

from __future__ import annotations

import re
from typing import Final

from app.core.config import settings

# Подстроки для must_use_tool (быстрый path) — согласованы с TOPIC_PATTERNS.
_DEFAULT_TRIGGERS: Final[tuple[str, ...]] = (
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
    "тополог",
    "layout",
    "событ",
    "конгест",
    "загрузк",
)

# Темы → regex (code-orchestrator / планирование read-tools).
TOPIC_PATTERNS: Final[dict[str, re.Pattern[str]]] = {
    "inventory": re.compile(
        r"(остат|запас|инвентар|sku|товар|складск|inventory|stock)", re.I
    ),
    "tasks": re.compile(r"(задач|задани|пикинг|отбор|warehouse.?task|tasks?\b)", re.I),
    "layout": re.compile(r"(тополог|layout|ячейк|слот|ряд|карт.*склад)", re.I),
    "congestion": re.compile(
        r"(загрузк|конгест|перегруж|congestion|зон.*загруз)", re.I
    ),
    "equipment": re.compile(
        r"(техник|парк\s+тех|погрузчик|forklift|equipment|единиц.*тех|вкладк\w*\s+техник)",
        re.I,
    ),
    "maintenance": re.compile(
        r"(то\b|т\.?\s*о\.?\b|техобслуж|моточас|просроч|календар|планов|maintenance|overdue)",
        re.I,
    ),
    "expiring": re.compile(r"(срок\s+годност|годност|просрочен.*товар|expir)", re.I),
    "events": re.compile(r"(событ|аудит|журнал|domain.?event|event\s+log)", re.I),
}


def detect_tool_topics(question: str) -> frozenset[str]:
    """Темы, для которых уместен read-инструмент (один источник для code-orch)."""
    text = (question or "").lower()
    return frozenset(name for name, pat in TOPIC_PATTERNS.items() if pat.search(text))


def must_use_tool(question: str) -> bool:
    """Детерминированный fallback: вопрос явно про данные склада → нужен tool."""
    if not bool(getattr(settings, "AGENT_MUST_USE_TOOL_ENABLED", True)):
        return False
    q = (question or "").lower()
    if any(t in q for t in _DEFAULT_TRIGGERS):
        return True
    # Дополнительно: совпадение тематических regex (единый контур с code-orch).
    return bool(detect_tool_topics(q))
