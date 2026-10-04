"""P0-3: durable outbox интеграции — без потери при сбое/рестарте; 576 слотов."""

from __future__ import annotations

from typing import Any

from unittest.mock import MagicMock

import pytest
from sqlalchemy import func
from sqlmodel import Session, col, select

from app.core.db import engine
from app.models import Item, WarehouseSlotOccupancy
from app.warehouse_sim.integration import (
    _SIM_STORAGE_BAYS,
    _SIM_STORAGE_LEVELS,
    _SIM_STORAGE_ROWS,
    _slot_from_context,
    apply_integration_queue,
    clear_process_caches,
    reset_demo_domain,
    seed_world_inventory,
)
from app.warehouse_sim.integration_outbox import (
    ensure_enqueued,
    make_event_key,
    outbox_counts,
    process_integration_outbox,
)
from app.warehouse_sim.layout import BLOCK_COUNT
from app.warehouse_sim.models import OUTBOX_DONE, OUTBOX_PENDING, SimIntegrationOutbox
from app.warehouse_sim.runtime import WarehouseSimRuntime
from app.warehouse_sim.world import create_world


def test_flush_db_failure_does_not_lose_queue(monkeypatch: pytest.MonkeyPatch) -> None:
    rt = WarehouseSimRuntime()
    events = [
        {
            "type": "ITEM_STORED",
            "event": {"id": 9001, "type": "ITEM_STORED"},
            "context": {"pallet": {"id": "p1"}},
        },
        {
            "type": "ITEM_STORED",
            "event": {"id": 9002, "type": "ITEM_STORED"},
            "context": {"pallet": {"id": "p2"}},
        },
    ]
    rt.mutate_world(lambda w: w.__setitem__("integration_queue", list(events)))

    def boom(*_a: object, **_k: object) -> tuple[dict[str, int], list[str]]:
        raise RuntimeError("db down")

    monkeypatch.setattr(
        "app.warehouse_sim.integration_outbox.process_integration_outbox",
        boom,
    )

    class _FakeSess:
        def __enter__(self) -> MagicMock:
            return MagicMock()

        def __exit__(self, *a: object) -> None:
            return None

    monkeypatch.setattr(
        "app.warehouse_sim.runtime.Session",
        lambda *_a, **_k: _FakeSess(),
    )
    monkeypatch.setattr(
        "app.warehouse_sim.runtime.persist_new_sim_events",
        lambda *_a, **_k: 0,
    )
    monkeypatch.setattr(
        "app.warehouse_sim.integration_outbox.ensure_enqueued",
        lambda *_a, **_k: 0,
    )
    monkeypatch.setattr(
        "app.warehouse_sim.integration_outbox.outbox_counts",
        lambda *_a, **_k: {"pending": 2, "done": 0, "dead_letter": 0, "lag": 2},
    )

    rt.flush_integration()
    # Память не дренировали до успеха.
    assert rt.mutate_world(lambda w: list(w.get("integration_queue") or [])) == events
    metrics = rt.integration_metrics()
    assert metrics["errors"] >= 1
    assert metrics["requeued"] >= 2
    assert metrics["lag"] >= 2


def test_flush_reapply_after_recovery_no_duplicates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """После сбоя и восстановления батч применяется один раз (без дублей в очереди)."""
    rt = WarehouseSimRuntime()
    events = [
        {
            "type": "UNKNOWN_NOOP",
            "event": {"id": 9100, "type": "UNKNOWN_NOOP"},
            "context": {},
        }
    ]
    rt.mutate_world(lambda w: w.__setitem__("integration_queue", list(events)))

    calls: list[int] = []

    def flaky(
        _session: object, _world: dict[str, Any], **_kwargs: object
    ) -> tuple[dict[str, int], list[str]]:
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("transient")
        key = make_event_key(events[0])
        return (
            {"applied": 1, "errors": 0, "requeued": 0, "commits": 1, "dead_letter": 0},
            [key],
        )

    monkeypatch.setattr(
        "app.warehouse_sim.integration_outbox.process_integration_outbox",
        flaky,
    )

    class _FakeSess:
        def __enter__(self) -> MagicMock:
            return MagicMock()

        def __exit__(self, *a: object) -> None:
            return None

    monkeypatch.setattr(
        "app.warehouse_sim.runtime.Session",
        lambda *_a, **_k: _FakeSess(),
    )
    monkeypatch.setattr(
        "app.warehouse_sim.runtime.persist_new_sim_events",
        lambda *_a, **_k: 0,
    )
    monkeypatch.setattr(
        "app.warehouse_sim.integration_outbox.ensure_enqueued",
        lambda *_a, **_k: 1,
    )
    monkeypatch.setattr(
        "app.warehouse_sim.integration_outbox.outbox_counts",
        lambda *_a, **_k: {"pending": 0, "done": 1, "dead_letter": 0, "lag": 0},
    )

    rt.flush_integration()
    assert len(rt.mutate_world(lambda w: list(w.get("integration_queue") or []))) == 1
    rt.flush_integration()
    assert rt.mutate_world(lambda w: list(w.get("integration_queue") or [])) == []
    assert len(calls) == 2


def test_restart_applies_pending_outbox_exactly_once(db: Session) -> None:
    """
    События в outbox → имитация рестарта (память очищена) → apply ровно один раз.
    """
    assert db.get_bind() is not None
    clear_process_caches()
    with Session(engine) as session:
        session.exec(select(SimIntegrationOutbox))  # warm
        for row in session.exec(select(SimIntegrationOutbox)).all():
            session.delete(row)
        session.commit()

    events = [
        {
            "type": "UNKNOWN_NOOP",
            "event": {"id": 9201, "type": "UNKNOWN_NOOP"},
            "context": {"tag": "a"},
        },
        {
            "type": "UNKNOWN_NOOP",
            "event": {"id": 9202, "type": "UNKNOWN_NOOP"},
            "context": {"tag": "b"},
        },
    ]

    # Процесс A: события попали в очередь и персистились, но apply не успел
    # (имитация краша — память потеряна, outbox остался pending).
    with Session(engine) as session:
        n = ensure_enqueued(session, events)
        session.commit()
        assert n == 2
        counts = outbox_counts(session)
        assert counts["pending"] == 2

    # Рестарт: новая runtime без memory queue
    rt = WarehouseSimRuntime()
    assert rt.mutate_world(lambda w: list(w.get("integration_queue") or [])) == []

    rt.flush_integration()

    with Session(engine) as session:
        counts = outbox_counts(session)
        assert counts["pending"] == 0
        done = list(
            session.exec(
                select(SimIntegrationOutbox).where(
                    SimIntegrationOutbox.status == OUTBOX_DONE
                )
            ).all()
        )
        keys = {r.event_key for r in done}
        assert make_event_key(events[0]) in keys
        assert make_event_key(events[1]) in keys

    # Повторный flush не создаёт дублей / повторных apply
    rt.flush_integration()
    with Session(engine) as session:
        assert outbox_counts(session)["pending"] == 0
        done_n = session.exec(
            select(func.count())
            .select_from(SimIntegrationOutbox)
            .where(
                col(SimIntegrationOutbox.status) == OUTBOX_DONE,
                col(SimIntegrationOutbox.event_key).in_(
                    [make_event_key(events[0]), make_event_key(events[1])]
                ),
            )
        ).one()
        assert int(done_n) == 2


def test_ensure_enqueued_deduplicates_by_event_key(db: Session) -> None:
    assert db.get_bind() is not None
    rec = {
        "type": "UNKNOWN_NOOP",
        "event": {"id": 9301, "type": "UNKNOWN_NOOP"},
        "context": {},
    }
    with Session(engine) as session:
        for row in session.exec(
            select(SimIntegrationOutbox).where(
                SimIntegrationOutbox.event_key == make_event_key(rec)
            )
        ).all():
            session.delete(row)
        session.commit()

        assert ensure_enqueued(session, [rec, rec, rec]) == 1
        session.commit()
        assert ensure_enqueued(session, [rec]) == 0
        session.commit()
        rows = list(
            session.exec(
                select(SimIntegrationOutbox).where(
                    SimIntegrationOutbox.event_key == make_event_key(rec)
                )
            ).all()
        )
        assert len(rows) == 1
        assert rows[0].status == OUTBOX_PENDING

        world: dict[str, Any] = {"bridge": {}}
        stats, keys = process_integration_outbox(session, world)
        assert stats["applied"] == 1
        assert keys == [make_event_key(rec)]
        stats2, keys2 = process_integration_outbox(session, world)
        assert stats2["applied"] == 0
        assert keys2 == []


def test_576_distinct_physical_slots() -> None:
    slots: set[tuple[int, int, int, int]] = set()
    for rack_n in range(1, BLOCK_COUNT + 1):
        for side in ("A", "B"):
            for level in range(1, _SIM_STORAGE_LEVELS + 1):
                for bay in range(1, _SIM_STORAGE_BAYS + 1):
                    s = _slot_from_context(
                        {
                            "cell": {
                                "rackId": f"rack-{rack_n}-{side}",
                                "level": level,
                                "bay": bay,
                            }
                        }
                    )
                    assert s is not None
                    slots.add(s)
    expected = _SIM_STORAGE_ROWS * _SIM_STORAGE_LEVELS * _SIM_STORAGE_BAYS
    assert expected == 576
    assert len(slots) == 576


def test_occupancy_projection_matches_seeded_world(db: Session) -> None:
    clear_process_caches()
    reset_demo_domain(db)
    world = create_world({"seed": 7, "initialFillRatio": 0.4, "faultRatePerHour": 0})
    seed_world_inventory(db, world)
    apply_integration_queue(db, world)

    items = list(db.exec(select(Item).where(col(Item.barcode).like("WDS-%"))).all())
    warehouse_items = [
        i
        for i in items
        if i.status == "warehouse"
        and i.storage_row is not None
        and i.storage_level is not None
        and i.storage_cell_x is not None
        and i.storage_cell_z is not None
    ]
    assert warehouse_items
    slot_keys = {
        (i.storage_row, i.storage_level, i.storage_cell_x, i.storage_cell_z)
        for i in warehouse_items
    }
    assert len(slot_keys) == len(warehouse_items)  # без коллизий слотов

    occ = list(db.exec(select(WarehouseSlotOccupancy)).all())
    assert len(occ) >= len(warehouse_items)

    reset_demo_domain(db)
    clear_process_caches()
