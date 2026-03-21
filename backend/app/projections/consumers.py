"""Обработчики проекций (вызываются из outbox-диспетчера)."""

from __future__ import annotations

import uuid
from typing import Any, Callable

from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session

from app.models import DomainEvent, TwinProjectionEntry

ConsumerFn = Callable[[Session, DomainEvent], None]


def _payload_summary(payload: dict[str, Any]) -> dict[str, Any]:
    keys = list(payload.keys())[:24]
    out: dict[str, Any] = {"keys": keys}
    for k in ("item_id", "warehouse_id", "task_id", "slot_key", "equipment_id", "alert_id"):
        if k in payload:
            out[k] = payload[k]
    return out


def twin_timeline_handler(session: Session, ev: DomainEvent) -> None:
    """Лента twin: идемпотентная вставка по domain_event_id."""
    stmt = (
        insert(TwinProjectionEntry.__table__)
        .values(
            id=uuid.uuid4(),
            domain_event_id=ev.id,
            event_seq=ev.event_seq,
            occurred_at=ev.occurred_at,
            event_type=ev.event_type,
            aggregate_type=ev.aggregate_type,
            aggregate_id=ev.aggregate_id,
            payload_summary=_payload_summary(ev.payload),
        )
        .on_conflict_do_nothing(index_elements=["domain_event_id"])
    )
    session.execute(stmt)


CONSUMER_HANDLERS: dict[str, ConsumerFn] = {
    "twin_timeline": twin_timeline_handler,
}
