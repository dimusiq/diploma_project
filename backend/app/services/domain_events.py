"""Эмиссия доменных событий: валидация payload, запись в лог + transactional outbox."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlmodel import Session

from app.events import catalog
from app.events.registry import normalize_event_payload
from app.models import DomainEvent, EventOutbox

# Обратная совместимость импортов (items.py и др.)
EVENT_ITEM_CREATED = catalog.EVENT_ITEM_CREATED
EVENT_ITEM_UPDATED = catalog.EVENT_ITEM_UPDATED
EVENT_ITEM_STORAGE_UPDATED = catalog.EVENT_ITEM_STORAGE_UPDATED
EVENT_ITEM_STATUS_CHANGED = catalog.EVENT_ITEM_STATUS_CHANGED
EVENT_ITEM_DELETED = catalog.EVENT_ITEM_DELETED


def _next_event_seq(session: Session) -> int:
    return int(
        session.execute(text("SELECT nextval('domain_event_event_seq_seq')")).scalar_one()
    )


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
    payload_schema_version: int = 1,
    strict_payload: bool = False,
) -> DomainEvent:
    """
    Пишет domain_event и строку event_outbox в той же транзакции.

    strict_payload=True — для типов из catalog.VERSIONED_EVENT_TYPES обязательна pydantic-модель v1.
    """
    normalized = normalize_event_payload(
        event_type,
        payload_schema_version,
        payload,
        strict_typed_events=strict_payload,
    )
    event_seq = _next_event_seq(session)
    row = DomainEvent(
        occurred_at=occurred_at or datetime.now(timezone.utc),
        actor_user_id=actor_user_id,
        event_type=event_type[:128],
        aggregate_type=aggregate_type[:64],
        aggregate_id=aggregate_id,
        payload=normalized,
        payload_schema_version=payload_schema_version,
        event_seq=event_seq,
        correlation_id=correlation_id,
    )
    session.add(row)
    session.flush()
    session.add(
        EventOutbox(
            domain_event_id=row.id,
            created_at=row.occurred_at,
        )
    )
    return row
