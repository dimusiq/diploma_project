"""
Безопасная модель выполнения инструментов агента.

read — немедленно (только ORM/SQLAlchemy, без raw SQL из текста LLM).
propose — описание намерения / dry-run без побочных эффектов (кроме режима sandbox).
act — мутации; в production по умолчанию только sandbox или ответ requires_confirmation.

Откат: для реальных act возвращаем compensation_hints в JSON (идемпотентные ключи / id сущности).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from enum import Enum


class ToolSafetyClass(str, Enum):
    READ = "read"
    PROPOSE = "propose"
    ACT = "act"


@dataclass
class AgentToolContext:
    """Прокидывается из HTTP-слоя в invoke_tool (run_id совпадает с AgentTrace)."""

    run_id: str
    actor_user_id: uuid.UUID
    sandbox: bool
    """Если True — act не пишет в БД, только симуляция ответа."""
    allow_mutating_tools: bool
    """Явное согласие клиента (UI); без этого act не выполняется."""
    is_superuser: bool

    def can_execute_act(self) -> bool:
        if self.sandbox:
            return False
        return self.allow_mutating_tools and self.is_superuser
