"""
Безопасная модель выполнения инструментов агента.

read — немедленно (только ORM/SQLAlchemy, без raw SQL из текста LLM).
propose — описание намерения / dry-run без побочных эффектов.
act — мутации; в production по умолчанию только sandbox или ответ requires_confirmation.

Типы живут в ``app.agent.contracts`` (слой без services); здесь — обратный re-export.
"""

from __future__ import annotations

from app.agent.contracts import AgentToolContext, ToolSafetyClass

__all__ = ["AgentToolContext", "ToolSafetyClass"]
