from sqlmodel import Session, select

from app.models import InboundOrder, Item, OutboundOrder, WarehouseTask
from app.warehouse_sim.integration import (
    BARCODE_PREFIX,
    SOURCE,
    _slot_from_context,
    apply_integration_queue,
    reset_demo_domain,
    seed_world_inventory,
)
from app.warehouse_sim.simulation import advance_world
from app.warehouse_sim.world import create_world

FAST_DEMO = {
    "seed": 42,
    "truckArrivalsPerHour": 8,
    "ordersPerHour": 20,
    "faultRatePerHour": 0,
    "jamRatePerHour": 0,
    "scanErrorRate": 0,
    "initialFillRatio": 0.55,
    "autoRepair": True,
}


def _sim_rows(rows: list, extra_attr: str = "extra"):
    out = []
    for row in rows:
        payload = getattr(row, extra_attr, None) or {}
        if payload.get("source") == SOURCE:
            out.append(row)
    return out


def test_full_warehouse_workflow_writes_existing_domain(db: Session) -> None:
    """Симуляция inbound → putaway → order → pick → pack → ship меняет реальные WMS-модели."""
    reset_demo_domain(db)
    world = create_world(FAST_DEMO)
    seed_world_inventory(db, world)
    apply_integration_queue(db, world)

    stock = list(db.exec(select(Item).where(Item.barcode.like(f"{BARCODE_PREFIX}%"))).all())
    assert stock, "стартовые паллеты должны стать Item"

    elapsed = 0.0
    step = 60.0
    while elapsed < 4 * 3600:
        advance_world(world, step)
        elapsed += step
        apply_integration_queue(db, world)
        if (
            world["metrics"]["palletsPutaway"] >= 1
            and world["metrics"]["palletsPicked"] >= 1
            and (
                world["metrics"]["ordersShipped"] >= 1
                or world["metrics"]["palletsShipped"] >= 1
            )
        ):
            break
    assert world["metrics"]["palletsReceived"] >= 1, world["metrics"]
    assert world["metrics"]["palletsPutaway"] >= 1, world["metrics"]

    db.expire_all()
    items = list(db.exec(select(Item).where(Item.barcode.like(f"{BARCODE_PREFIX}%"))).all())
    tasks = [
        t
        for t in db.exec(select(WarehouseTask)).all()
        if (t.payload or {}).get("source") == SOURCE
    ]
    inbound = _sim_rows(list(db.exec(select(InboundOrder)).all()))
    outbound = _sim_rows(list(db.exec(select(OutboundOrder)).all()))

    assert world["metrics"]["palletsReceived"] >= 1
    assert world["metrics"]["palletsPutaway"] >= 1
    assert any(i.status in ("warehouse", "shipment", "shipped") for i in items)
    assert any(t.task_type in ("putaway", "pick", "move") for t in tasks)
    assert any(t.status in ("completed", "in_progress", "pending", "blocked") for t in tasks)
    assert inbound
    assert any(o.status in ("open", "in_progress", "received", "closed") for o in inbound)
    assert outbound
    assert world["metrics"]["ordersCreated"] >= 1

    reset_demo_domain(db)
    db.expire_all()
    leftover_items = list(
        db.exec(select(Item).where(Item.barcode.like(f"{BARCODE_PREFIX}%"))).all()
    )
    leftover_in = _sim_rows(list(db.exec(select(InboundOrder)).all()))
    leftover_out = _sim_rows(list(db.exec(select(OutboundOrder)).all()))
    leftover_tasks = [
        t
        for t in db.exec(select(WarehouseTask)).all()
        if (t.payload or {}).get("source") == SOURCE
    ]
    assert leftover_items == []
    assert leftover_in == []
    assert leftover_out == []
    assert leftover_tasks == []


def test_slot_from_context_uses_one_based_cell_z() -> None:
    slot_a = _slot_from_context({"cell": {"rackId": "rack-3-A", "level": 2, "bay": 4}})
    slot_b = _slot_from_context({"cell": {"rackId": "rack-3-B", "level": 2, "bay": 4}})
    assert slot_a == (3, 2, 4, 1)
    assert slot_b == (3, 2, 4, 1)
