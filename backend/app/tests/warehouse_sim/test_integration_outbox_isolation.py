"""P1-6: изоляция ошибок outbox, backoff, dead-letter, prune done."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import patch

from sqlmodel import Session, col, select

from app.warehouse_sim.integration_outbox import (
    MAX_ATTEMPTS,
    backoff_seconds,
    ensure_enqueued,
    fetch_pending,
    make_event_key,
    process_integration_outbox,
    prune_done_integration_outbox,
)
from app.warehouse_sim.models import (
    OUTBOX_DEAD_LETTER,
    OUTBOX_DONE,
    OUTBOX_PENDING,
    SimIntegrationOutbox,
)


def _noop(seq: int) -> dict[str, Any]:
    return {
        "type": "UNKNOWN_NOOP",
        "event": {"id": seq, "type": "UNKNOWN_NOOP"},
        "context": {},
    }


def test_backoff_seconds_grows_and_caps() -> None:
    assert backoff_seconds(1) == 1.0
    assert backoff_seconds(2) == 2.0
    assert backoff_seconds(3) == 4.0
    assert backoff_seconds(20) == 300.0


def test_one_poison_does_not_bump_neighbors(db: Session) -> None:
    """Батч из 10: 1 отравленный → 9 done, 1 requeued; attempts соседей = 0."""
    events = [_noop(10_000 + i) for i in range(10)]
    poison_key = make_event_key(events[4])
    assert ensure_enqueued(db, events) == 10
    db.commit()

    real_apply = __import__(
        "app.warehouse_sim.integration_handlers", fromlist=["_apply_one"]
    )._apply_one

    def flaky(ctx: Any, rec: dict[str, Any]) -> dict[str, Any]:
        if make_event_key(rec) == poison_key:
            raise RuntimeError("poisoned event")
        return real_apply(ctx, rec)

    world: dict[str, Any] = {"bridge": {}}
    with patch(
        "app.warehouse_sim.integration_outbox._apply_one",
        side_effect=flaky,
    ):
        stats, keys = process_integration_outbox(db, world, limit=20)

    assert stats["applied"] == 9
    assert stats["errors"] == 1
    assert stats["requeued"] == 1
    assert stats["dead_letter"] == 0
    assert len(keys) == 9
    assert poison_key not in keys

    rows = {
        r.event_key: r
        for r in db.exec(select(SimIntegrationOutbox)).all()
        if r.event_key.startswith("1000")
        or r.event_key in {make_event_key(e) for e in events}
    }
    # Все 10 ключей из фикстуры.
    fixture_keys = {make_event_key(e) for e in events}
    rows = {k: r for k, r in rows.items() if k in fixture_keys}
    assert len(rows) == 10

    poison = rows[poison_key]
    assert poison.status == OUTBOX_PENDING
    assert poison.attempts == 1
    assert poison.next_attempt_at is not None
    assert poison.next_attempt_at > datetime.now(timezone.utc) - timedelta(seconds=1)

    for key, row in rows.items():
        if key == poison_key:
            continue
        assert row.status == OUTBOX_DONE
        assert row.attempts == 0


def test_poison_exhaustion_goes_dead_letter(db: Session) -> None:
    rec = _noop(11_001)
    key = make_event_key(rec)
    assert ensure_enqueued(db, [rec]) == 1
    db.commit()
    row = db.exec(
        select(SimIntegrationOutbox).where(SimIntegrationOutbox.event_key == key)
    ).one()
    row.attempts = MAX_ATTEMPTS - 1
    row.next_attempt_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.add(row)
    db.commit()

    def always_fail(_ctx: Any, _rec: dict[str, Any]) -> dict[str, Any]:
        raise RuntimeError("still poison")

    with patch(
        "app.warehouse_sim.integration_outbox._apply_one",
        side_effect=always_fail,
    ):
        stats, keys = process_integration_outbox(db, {"bridge": {}}, limit=5)

    assert stats["applied"] == 0
    assert stats["dead_letter"] == 1
    assert keys == []
    db.expire_all()
    row = db.exec(
        select(SimIntegrationOutbox).where(SimIntegrationOutbox.event_key == key)
    ).one()
    assert row.status == OUTBOX_DEAD_LETTER
    assert row.attempts == MAX_ATTEMPTS


def test_backoff_skips_until_next_attempt_at(db: Session) -> None:
    rec = _noop(12_001)
    key = make_event_key(rec)
    assert ensure_enqueued(db, [rec]) == 1
    db.commit()

    with patch(
        "app.warehouse_sim.integration_outbox._apply_one",
        side_effect=RuntimeError("fail once"),
    ):
        stats, _ = process_integration_outbox(db, {"bridge": {}}, limit=5)
    assert stats["requeued"] == 1

    db.expire_all()
    row = db.exec(
        select(SimIntegrationOutbox).where(SimIntegrationOutbox.event_key == key)
    ).one()
    assert row.next_attempt_at is not None
    future = row.next_attempt_at

    # Сразу после ошибки due нет.
    due = fetch_pending(db, limit=10, now=datetime.now(timezone.utc))
    assert all(r.event_key != key for r in due)

    # После наступления next_attempt_at — снова due.
    due_later = fetch_pending(db, limit=10, now=future + timedelta(seconds=1))
    assert any(r.event_key == key for r in due_later)


def test_redelivery_idempotent_after_done(db: Session) -> None:
    rec = _noop(13_001)
    key = make_event_key(rec)
    assert ensure_enqueued(db, [rec]) == 1
    db.commit()
    world: dict[str, Any] = {"bridge": {}}
    s1, k1 = process_integration_outbox(db, world, limit=5)
    assert s1["applied"] == 1 and k1 == [key]
    s2, k2 = process_integration_outbox(db, world, limit=5)
    assert s2["applied"] == 0 and k2 == []
    n = db.exec(
        select(SimIntegrationOutbox).where(
            col(SimIntegrationOutbox.event_key) == key,
            col(SimIntegrationOutbox.status) == OUTBOX_DONE,
        )
    ).all()
    assert len(n) == 1


def test_prune_done_integration_outbox(db: Session) -> None:
    rec = _noop(14_001)
    key = make_event_key(rec)
    assert ensure_enqueued(db, [rec]) == 1
    db.commit()
    process_integration_outbox(db, {"bridge": {}}, limit=5)
    db.expire_all()
    row = db.exec(
        select(SimIntegrationOutbox).where(SimIntegrationOutbox.event_key == key)
    ).one()
    assert row.status == OUTBOX_DONE
    old = datetime.now(timezone.utc) - timedelta(days=60)
    row.completed_at = old
    db.add(row)
    db.commit()

    deleted = prune_done_integration_outbox(
        db, cutoff=datetime.now(timezone.utc) - timedelta(days=30), batch_size=100
    )
    db.commit()
    assert deleted == 1
    assert (
        db.exec(
            select(SimIntegrationOutbox).where(SimIntegrationOutbox.event_key == key)
        ).first()
        is None
    )
