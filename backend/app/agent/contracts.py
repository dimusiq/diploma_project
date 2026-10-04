"""
Общие протоколы/типы агента без зависимости от app.services.

Сервисы и agent-модули импортируют отсюда (или через tool_safety re-export),
чтобы не замыкать agent/ ↔ services/ на уровне типов.
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
    """Если True — act/мутации не пишут в БД, только симуляция ответа."""
    allow_mutating_tools: bool
    """Явное согласие клиента (UI); без этого act не выполняется."""
    is_superuser: bool

    def can_execute_act(self) -> bool:
        if self.sandbox:
            return False
        return self.allow_mutating_tools and self.is_superuser
