"""Запись доменных событий (digital twin / аудит жизненного цикла сущностей)."""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session

from app.models import DomainEvent

# Типы событий (контролируемый словарь для клиентов и воркеров)
EVENT_ITEM_CREATED = "item.created"
EVENT_ITEM_UPDATED = "item.updated"
EVENT_ITEM_STORAGE_UPDATED = "item.storage_updated"
EVENT_ITEM_STATUS_CHANGED = "item.status_changed"
EVENT_ITEM_DELETED = "item.deleted"


def emit_domain_event(
    session: Session,
    *,
    event_type: str,
    aggregate_type: str,
    aggregate_id: uuid.UUID,
    payload: dict[str, Any],
    actor_user_id: uuid.UUID | None,
    correlation_id: uuid.UUID | None = None,
    occurred_at: datetime | None = None,
) -> DomainEvent:
    row = DomainEvent(
        occurred_at=occurred_at or datetime.now(timezone.utc),
        actor_user_id=actor_user_id,
        event_type=event_type[:128],
        aggregate_type=aggregate_type[:64],
        aggregate_id=aggregate_id,
        payload=payload,
        correlation_id=correlation_id,
    )
    session.add(row)
    return row
