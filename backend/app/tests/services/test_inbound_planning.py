"""P1-6/P1-8: putaway-задачи после факта приёмки строк."""

from __future__ import annotations

import uuid

from sqlmodel import Session, select

from app.models import InboundOrder, Warehouse, WarehouseTask
from app.services.inbound_planning import (
    plan_inbound_putaways,
    sync_inbound_status_from_tasks,
)


def _warehouse(db: Session) -> Warehouse:
    row = db.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if row:
        return row
    row = Warehouse(code="default", name="Основной склад")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_receiving_creates_putaway_tasks_idempotent(db: Session) -> None:
    wh = _warehouse(db)
    order = InboundOrder(
        warehouse_id=wh.id,
        code=f"IN-PUT-{uuid.uuid4().hex[:8]}",
        status="receiving",
        lines={
            "items": [
                {
                    "skuId": "IN-SKU-1",
                    "quantity": 2,
                    "received_quantity": 2,
                    "receiving_processed": True,
                },
                {
                    "skuId": "IN-SKU-2",
                    "quantity": 1,
                    "received_quantity": 1,
                    "receiving_processed": True,
                },
            ]
        },
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    s1 = plan_inbound_putaways(db, order)
    db.commit()
    s2 = plan_inbound_putaways(db, order)
    db.commit()

    assert s1["created"] == 2
    assert s2["created"] == 0
    assert s2["skipped_existing"] == 2

    tasks = list(
        db.exec(
            select(WarehouseTask).where(
                WarehouseTask.warehouse_id == wh.id,
                WarehouseTask.task_type == "putaway",
            )
        ).all()
    )
    mine = [
        t
        for t in tasks
        if isinstance(t.payload, dict) and t.payload.get("order_id") == str(order.id)
    ]
    assert len(mine) == 2
    assert all(t.status == "pending" for t in mine)

    for t in mine:
        t.status = "completed"
        db.add(t)
    db.commit()
    sync_inbound_status_from_tasks(db, order)
    db.commit()
    db.refresh(order)
    assert order.status == "closed"


def test_plan_skips_unreceived_lines(db: Session) -> None:
    wh = _warehouse(db)
    order = InboundOrder(
        warehouse_id=wh.id,
        code=f"IN-SKIP-{uuid.uuid4().hex[:8]}",
        status="receiving",
        lines={
            "items": [
                {"skuId": "X", "quantity": 5},
            ]
        },
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    stats = plan_inbound_putaways(db, order)
    db.commit()
    assert stats["created"] == 0
