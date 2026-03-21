"""
Оценка качества ответов и offline benchmark (заготовка).

Сюда можно подключить LLM-as-judge, golden set или ручную разметку по `AgentTrace`.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.agent.trace import AgentTrace


def note_reply_for_evaluation(_reply: str, _trace: AgentTrace) -> None:
    """Хук после успешного ответа: зарезервировано под скоринг и датасеты."""
    return None


def offline_benchmark_placeholder() -> None:
    """Зарезервировано: прогон фиксированных сценариев без HTTP."""
    return None
