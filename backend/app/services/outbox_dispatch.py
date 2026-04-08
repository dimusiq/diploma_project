"""Доставка событий из outbox зарегистрированным потребителям проекций."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, col, select

from app.models import DomainEvent, EventOutbox, ProjectionConsumerProcessed
from app.projections.consumers import CONSUMER_HANDLERS

logger = logging.getLogger(__name__)

ConsumerFn = Callable[[Session, DomainEvent], None]


def try_claim_processed(
    session: Session,
    *,
    consumer_name: str,
    domain_event_id: Any,
) -> bool:
    """True, если эта пара (consumer, event) вставлена впервые (идемпотентность)."""
    stmt = (
        insert(ProjectionConsumerProcessed)
        .values(
            consumer_name=consumer_name[:64],
            domain_event_id=domain_event_id,
            processed_at=datetime.now(timezone.utc),
        )
        .on_conflict_do_nothing(
            index_elements=["consumer_name", "domain_event_id"],
        )
        .returning(ProjectionConsumerProcessed.domain_event_id)
    )
    res = session.execute(stmt)
    # psycopg often reports rowcount -1 for INSERT … ON CONFLICT; use RETURNING.
    return res.fetchone() is not None


def process_single_outbox(
    session: Session,
    outbox: EventOutbox,
    *,
    consumers: dict[str, ConsumerFn] | None = None,
) -> None:
    registry = consumers or CONSUMER_HANDLERS
    ev = session.get(DomainEvent, outbox.domain_event_id)
    if ev is None:
        outbox.completed_at = datetime.now(timezone.utc)
        outbox.last_error = "domain_event missing"
        session.add(outbox)
        return

    for name, handler in registry.items():
        if not try_claim_processed(session, consumer_name=name, domain_event_id=ev.id):
            continue
        try:
            handler(session, ev)
        except Exception:
            session.execute(
                delete(ProjectionConsumerProcessed).where(
                    col(ProjectionConsumerProcessed.consumer_name) == name,
                    col(ProjectionConsumerProcessed.domain_event_id) == ev.id,
                )
            )
            raise

    outbox.completed_at = datetime.now(timezone.utc)
    outbox.last_error = None
    session.add(outbox)


def process_outbox_batch(
    session: Session,
    *,
    limit: int = 50,
    consumers: dict[str, ConsumerFn] | None = None,
) -> dict[str, int]:
    """
    Берёт незавершённые outbox-строки с блокировкой SKIP LOCKED, для каждой вызывает всех потребителей.
    """
    stmt = (
        select(EventOutbox)
        .where(EventOutbox.completed_at.is_(None))
        .order_by(EventOutbox.created_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    rows = list(session.exec(stmt).all())
    processed = 0
    failed = 0
    max_attempts = 10
    for ob in rows:
        try:
            process_single_outbox(session, ob, consumers=consumers)
            processed += 1
        except Exception:
            logger.exception("Outbox dispatch failed for domain_event_id=%s", ob.domain_event_id)
            failed += 1
            ob.attempts = (ob.attempts or 0) + 1
            ob.last_error = "consumer_error"
            if ob.attempts >= max_attempts:
                ob.completed_at = datetime.now(timezone.utc)
                ob.last_error = f"dead_letter: exceeded {max_attempts} attempts"
            session.add(ob)
    return {"batch_taken": len(rows), "completed": processed, "failed": failed}


def enqueue_replay_all_domain_events(session: Session) -> int:
    """
    Сбрасывает outbox и ставит в очередь все события из domain_event по event_seq.
    Очищать projection_consumer_processed и twin — вызывающий код (см. API replay).
    """
    session.execute(delete(EventOutbox))
    events = list(
        session.exec(select(DomainEvent).order_by(DomainEvent.event_seq)).all()
    )
    for ev in events:
        session.add(
            EventOutbox(
                domain_event_id=ev.id,
                created_at=ev.occurred_at,
            )
        )
    return len(events)
