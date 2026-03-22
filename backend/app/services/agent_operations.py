"""Оркестрация долгих операций агента: память сессии, форматирование для контекста LLM."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session

from app.models import AgentOperationSession, User


def get_operation_session_for_user(
    session: Session,
    *,
    session_id: uuid.UUID,
    user: User,
) -> AgentOperationSession | None:
    row = session.get(AgentOperationSession, session_id)
    if row is None or row.user_id != user.id:
        return None
    return row


def format_operation_memory_block(op: AgentOperationSession) -> str | None:
    parts: list[str] = []
    if op.rolling_summary and op.rolling_summary.strip():
        parts.append(f"Сводка операционной сессии:\n{op.rolling_summary.strip()}")
    facts = op.facts or []
    if facts:
        tail = facts[-15:] if len(facts) > 15 else facts
        lines: list[str] = []
        for i, f in enumerate(tail, start=1):
            if isinstance(f, dict):
                lines.append(f"{i}. {json.dumps(f, ensure_ascii=False, default=str)[:500]}")
            else:
                lines.append(f"{i}. {str(f)[:500]}")
        parts.append("Недавние факты из этой сессии:\n" + "\n".join(lines))
    return "\n\n".join(parts) if parts else None


def append_session_fact(
    session: Session,
    *,
    op: AgentOperationSession,
    fact: dict[str, Any],
) -> None:
    facts = list(op.facts or [])
    facts.append(fact)
    if len(facts) > 200:
        facts = facts[-200:]
    op.facts = facts
    op.updated_at = datetime.now(timezone.utc)
    session.add(op)
