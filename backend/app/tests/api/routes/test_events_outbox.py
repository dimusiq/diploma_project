"""Transactional outbox и проекция twin_timeline."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import EventOutbox, TwinProjectionEntry
from app.services.domain_events import EVENT_ITEM_CREATED, emit_domain_event
from app.services.outbox_dispatch import process_outbox_batch


def test_emit_domain_event_creates_pending_outbox(db: Session) -> None:
    uid = uuid.uuid4()
    ev = emit_domain_event(
        db,
        event_type=EVENT_ITEM_CREATED,
        aggregate_type="item",
        aggregate_id=uid,
        payload={"title": "x", "schema_version": 1},
        actor_user_id=None,
    )
    db.commit()
    ob = db.exec(select(EventOutbox).where(EventOutbox.domain_event_id == ev.id)).first()
    assert ob is not None
    assert ob.completed_at is None


def test_outbox_dispatch_writes_twin_projection(db: Session) -> None:
    aid = uuid.uuid4()
    emit_domain_event(
        db,
        event_type=EVENT_ITEM_CREATED,
        aggregate_type="item",
        aggregate_id=aid,
        payload={"schema_version": 1},
        actor_user_id=None,
    )
    db.commit()
    # Drain queue: dev DB may have many pending outbox rows from earlier runs.
    stats = {"completed": 0}
    while True:
        batch = process_outbox_batch(db, limit=200)
        db.commit()
        stats["completed"] += batch["completed"]
        if batch["batch_taken"] == 0:
            break
    assert stats["completed"] >= 1
    row = db.exec(select(TwinProjectionEntry).where(TwinProjectionEntry.aggregate_id == aid)).first()
    assert row is not None
    assert row.event_type == EVENT_ITEM_CREATED


def test_outbox_dispatch_idempotent(db: Session) -> None:
    aid = uuid.uuid4()
    emit_domain_event(
        db,
        event_type=EVENT_ITEM_CREATED,
        aggregate_type="item",
        aggregate_id=aid,
        payload={"schema_version": 1},
        actor_user_id=None,
    )
    db.commit()

    def _drain() -> None:
        while True:
            b = process_outbox_batch(db, limit=200)
            db.commit()
            if b["batch_taken"] == 0:
                break

    _drain()
    n1 = len(db.exec(select(TwinProjectionEntry).where(TwinProjectionEntry.aggregate_id == aid)).all())
    _drain()
    db.commit()
    n2 = len(db.exec(select(TwinProjectionEntry).where(TwinProjectionEntry.aggregate_id == aid)).all())
    assert n1 == n2 == 1


def test_projections_replay_endpoint(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/projections/replay",
        headers=superuser_token_headers,
        json={"purge_twin_timeline": True, "consumer_names": None},
    )
    assert r.status_code == 200
    data = r.json()
    assert "outbox_enqueued" in data
    assert "twin_timeline" in data["registered_consumers"]


def test_twin_feed_requires_audit_permission(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/projections/twin-feed")
    assert r.status_code in (401, 403)
