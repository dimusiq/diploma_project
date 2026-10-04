"""Ретеншен журналов: старые удаляются, свежие и pending outbox остаются."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, col, select

from app.models import (
    DomainEvent,
    EventOutbox,
    ProjectionConsumerProcessed,
    TwinProjectionEntry,
)
from app.services.domain_events import EVENT_ITEM_CREATED, emit_domain_event
from app.services.event_retention import relation_total_bytes, run_event_retention
from app.services.outbox_dispatch import process_outbox_batch
from app.warehouse_sim.models import SimEvent


def _drain_outbox(db: Session) -> None:
    while True:
        batch = process_outbox_batch(db, limit=200)
        db.commit()
        if batch["batch_taken"] == 0:
            break


def test_retention_deletes_old_keeps_fresh_and_pending(db: Session) -> None:
    now = datetime.now(timezone.utc)
    old_at = now - timedelta(days=120)
    mid_pcp_at = now - timedelta(
        days=45
    )  # старше 30д consumer, но domain ещё «свежий» по 90д
    fresh_at = now - timedelta(days=3)

    # 1) Старое событие — доставляем (completed outbox + twin + pcp), затем старим даты.
    old_aid = uuid.uuid4()
    old_ev = emit_domain_event(
        db,
        event_type=EVENT_ITEM_CREATED,
        aggregate_type="item",
        aggregate_id=old_aid,
        payload={"schema_version": 1, "title": "old"},
        actor_user_id=None,
        occurred_at=old_at,
    )
    db.commit()
    _drain_outbox(db)

    old_ob = db.exec(
        select(EventOutbox).where(EventOutbox.domain_event_id == old_ev.id)
    ).one()
    assert old_ob.completed_at is not None
    old_ob.completed_at = old_at
    old_ob.created_at = old_at
    db.add(old_ob)

    twin = db.exec(
        select(TwinProjectionEntry).where(
            TwinProjectionEntry.domain_event_id == old_ev.id
        )
    ).one()
    twin.occurred_at = old_at
    db.add(twin)

    for pcp in db.exec(
        select(ProjectionConsumerProcessed).where(
            ProjectionConsumerProcessed.domain_event_id == old_ev.id
        )
    ).all():
        pcp.processed_at = mid_pcp_at
        db.add(pcp)
    db.commit()

    # 2) Свежее доставленное событие (drain до создания pending).
    fresh_aid = uuid.uuid4()
    fresh_ev = emit_domain_event(
        db,
        event_type=EVENT_ITEM_CREATED,
        aggregate_type="item",
        aggregate_id=fresh_aid,
        payload={"schema_version": 1, "title": "fresh"},
        actor_user_id=None,
        occurred_at=fresh_at,
    )
    db.commit()
    _drain_outbox(db)

    # 3) Старое событие с pending outbox — нельзя удалять (после последнего drain).
    pending_aid = uuid.uuid4()
    pending_ev = emit_domain_event(
        db,
        event_type=EVENT_ITEM_CREATED,
        aggregate_type="item",
        aggregate_id=pending_aid,
        payload={"schema_version": 1, "title": "pending-old"},
        actor_user_id=None,
        occurred_at=old_at,
    )
    db.commit()
    pending_ob = db.exec(
        select(EventOutbox).where(EventOutbox.domain_event_id == pending_ev.id)
    ).one()
    assert pending_ob.completed_at is None

    # 4) wsim: старое и свежее.
    old_wsim = SimEvent(
        seq=9_000_001,
        occurred_at=old_at,
        event_type="TEST_OLD",
        message="old sim event",
    )
    fresh_wsim = SimEvent(
        seq=9_000_002,
        occurred_at=fresh_at,
        event_type="TEST_FRESH",
        message="fresh sim event",
    )
    db.add(old_wsim)
    db.add(fresh_wsim)
    db.commit()
    old_ev_id = old_ev.id
    pending_ev_id = pending_ev.id
    fresh_ev_id = fresh_ev.id
    old_wsim_id = old_wsim.id
    fresh_wsim_id = fresh_wsim.id

    size_before = relation_total_bytes(db, "domain_event")
    stats = run_event_retention(db, now=now, batch_size=500, max_batches=5)

    assert stats["deleted"]["domain_event"] >= 1
    assert stats["deleted"]["wsim_event"] >= 1
    assert stats["sizes_before_bytes"]["domain_event"] == size_before
    assert "domain_event" in stats["sizes_after_bytes"]
    assert stats["remaining"]["domain_event"] >= 1

    db.expire_all()
    assert db.get(DomainEvent, old_ev_id) is None
    assert db.get(DomainEvent, pending_ev_id) is not None
    assert db.get(DomainEvent, fresh_ev_id) is not None
    assert db.get(SimEvent, old_wsim_id) is None
    assert db.get(SimEvent, fresh_wsim_id) is not None

    # Pending outbox всё ещё незавершён.
    still_pending = db.exec(
        select(EventOutbox).where(EventOutbox.domain_event_id == pending_ev_id)
    ).one()
    assert still_pending.completed_at is None

    # Twin для удалённого события исчез (CASCADE или отдельный prune).
    assert (
        db.exec(
            select(TwinProjectionEntry).where(
                TwinProjectionEntry.domain_event_id == old_ev_id
            )
        ).first()
        is None
    )


def test_retention_prunes_old_projection_consumer_rows(db: Session) -> None:
    """Строки идемпотентности старше 30 дней удаляются отдельно от domain_event."""
    now = datetime.now(timezone.utc)
    # Свежий domain_event (не под 90д), но PCP состарим.
    aid = uuid.uuid4()
    ev = emit_domain_event(
        db,
        event_type=EVENT_ITEM_CREATED,
        aggregate_type="item",
        aggregate_id=aid,
        payload={"schema_version": 1},
        actor_user_id=None,
        occurred_at=now - timedelta(days=5),
    )
    db.commit()
    _drain_outbox(db)

    pcps = list(
        db.exec(
            select(ProjectionConsumerProcessed).where(
                ProjectionConsumerProcessed.domain_event_id == ev.id
            )
        ).all()
    )
    assert pcps
    for pcp in pcps:
        pcp.processed_at = now - timedelta(days=40)
        db.add(pcp)
    db.commit()

    stats = run_event_retention(db, now=now, batch_size=500, max_batches=5)
    assert stats["deleted"]["projection_consumer_processed"] >= len(pcps)
    left = db.exec(
        select(ProjectionConsumerProcessed).where(
            col(ProjectionConsumerProcessed.domain_event_id) == ev.id
        )
    ).all()
    assert left == []
    # Само событие осталось.
    assert db.get(DomainEvent, ev.id) is not None
