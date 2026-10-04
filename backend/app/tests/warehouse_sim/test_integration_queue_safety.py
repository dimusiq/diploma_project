"""P0-4: очередь интеграции не теряется при сбое; 576 различимых слотов."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from sqlmodel import Session, select

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
from app.warehouse_sim.layout import BLOCK_COUNT
from app.warehouse_sim.runtime import WarehouseSimRuntime
from app.warehouse_sim.world import create_world


def test_flush_db_failure_does_not_lose_queue(monkeypatch: pytest.MonkeyPatch) -> None:
    rt = WarehouseSimRuntime()
    events = [
        {"type": "ITEM_STORED", "context": {"pallet": {"id": "p1"}}},
        {"type": "ITEM_STORED", "context": {"pallet": {"id": "p2"}}},
    ]
    rt.mutate_world(lambda w: w.__setitem__("integration_queue", list(events)))

    def boom(*_a: object, **_k: object) -> dict[str, int]:
        raise RuntimeError("db down")

    monkeypatch.setattr(
        "app.warehouse_sim.integration.apply_integration_queue",
        boom,
    )

    # Session context must succeed to reach apply — patch apply only
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

    rt.flush_integration()
    assert rt.mutate_world(lambda w: list(w.get("integration_queue") or [])) == events
    metrics = rt.integration_metrics()
    assert metrics["errors"] >= 1
    assert metrics["requeued"] >= 2
    assert metrics["lag"] == 2


def test_flush_reapply_after_recovery_no_duplicates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """После сбоя и восстановления батч применяется один раз (без дублей в очереди)."""
    rt = WarehouseSimRuntime()
    events = [{"type": "UNKNOWN_NOOP", "context": {}}]
    rt.mutate_world(lambda w: w.__setitem__("integration_queue", list(events)))

    calls: list[int] = []

    def flaky(
        _session: object, _world: dict, queue: list | None = None
    ) -> dict[str, int]:
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("transient")
        # успех: очередь уже drained вызывающим; имитируем apply без requeue
        return {"applied": len(queue or []), "errors": 0, "requeued": 0, "commits": 1}

    monkeypatch.setattr(
        "app.warehouse_sim.integration.apply_integration_queue",
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

    rt.flush_integration()
    assert len(rt.mutate_world(lambda w: list(w.get("integration_queue") or []))) == 1
    rt.flush_integration()
    assert rt.mutate_world(lambda w: list(w.get("integration_queue") or [])) == []
    assert len(calls) == 2


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

    items = list(db.exec(select(Item).where(Item.barcode.like("WDS-%"))).all())
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
    # проекция по source-симуляции: все warehouse WDS items
    assert len(occ) >= len(warehouse_items)

    reset_demo_domain(db)
    clear_process_caches()
