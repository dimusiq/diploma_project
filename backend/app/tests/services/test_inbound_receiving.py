"""P1-8: приёмка как операция (факт, расхождение, putaway, закрытие)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from app.models import (
    DomainEvent,
    InboundOrder,
    InventoryLot,
    Item,
    Warehouse,
    WarehouseTask,
)
from app.services.inbound_planning import sync_inbound_status_from_tasks
from app.services.inbound_receiving import close_receiving, receive_line
from app.tests.utils.user import create_random_user


def _warehouse(db: Session) -> Warehouse:
    row = db.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if row:
        return row
    row = Warehouse(code="default", name="Основной склад")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_receive_shortage_creates_putaway_and_warehouse_item(db: Session) -> None:
    wh = _warehouse(db)
    user = create_random_user(db)
    order = InboundOrder(
        warehouse_id=wh.id,
        code=f"IN-RCV-{uuid.uuid4().hex[:8]}",
        status="open",
        lines={
            "items": [
                {"skuId": f"RCV-{uuid.uuid4().hex[:6]}", "quantity": 10},
            ]
        },
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    result = receive_line(
        db,
        order,
        received_quantity=8,
        actor_user_id=user.id,
        line_index=0,
        discrepancy_reason="Недостача на воротах",
    )
    db.commit()
    db.refresh(order)

    assert result["putaway_created"] == 1
    assert result["item_id"]
    assert result["discrepancy"] is not None
    assert result["discrepancy"]["type"] == "shortage"
    assert result["discrepancy"]["quantity"] == 2

    assert order.status == "receiving"
    lines = (order.lines or {}).get("items") or []
    assert lines[0]["received_quantity"] == 8
    assert lines[0]["receiving_processed"] is True

    item = db.get(Item, uuid.UUID(str(result["item_id"])))
    assert item is not None
    assert item.status == "warehouse"
    assert item.quantity == 8
    assert item.storage_row is not None
    assert item.storage_level is not None
    assert item.storage_cell_x is not None

    tasks = [
        t
        for t in db.exec(
            select(WarehouseTask).where(
                WarehouseTask.warehouse_id == wh.id,
                WarehouseTask.task_type == "putaway",
            )
        ).all()
        if isinstance(t.payload, dict) and t.payload.get("order_id") == str(order.id)
    ]
    assert len(tasks) == 1
    payload0 = tasks[0].payload
    assert isinstance(payload0, dict)
    assert payload0.get("quantity") == 8

    events = list(
        db.exec(
            select(DomainEvent).where(DomainEvent.aggregate_id == order.id)
        ).all()
    )
    types = {e.event_type for e in events}
    assert "inbound.received" in types
    assert "inbound.discrepancy" in types

    close_receiving(db, order, actor_user_id=user.id)
    db.commit()
    db.refresh(order)
    assert order.status == "received"

    for t in tasks:
        t.status = "completed"
        db.add(t)
    db.commit()
    sync_inbound_status_from_tasks(db, order)
    db.commit()
    db.refresh(order)
    assert order.status == "closed"


def test_close_receiving_rejects_unprocessed_lines(db: Session) -> None:
    wh = _warehouse(db)
    user = create_random_user(db)
    order = InboundOrder(
        warehouse_id=wh.id,
        code=f"IN-BLK-{uuid.uuid4().hex[:8]}",
        status="receiving",
        lines={
            "items": [
                {"skuId": "A", "quantity": 5},
                {"skuId": "B", "quantity": 3},
            ]
        },
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    receive_line(
        db,
        order,
        received_quantity=5,
        actor_user_id=user.id,
        line_index=0,
    )
    db.commit()

    with pytest.raises(HTTPException) as exc:
        close_receiving(db, order, actor_user_id=user.id)
    assert exc.value.status_code == 409
    assert "необработанн" in str(exc.value.detail).lower()


def test_receive_creates_inventory_lot_with_expiry(db: Session) -> None:
    wh = _warehouse(db)
    user = create_random_user(db)
    expiry = date.today() + timedelta(days=14)
    sku = f"LOT-{uuid.uuid4().hex[:6]}"
    order = InboundOrder(
        warehouse_id=wh.id,
        code=f"IN-LOT-{uuid.uuid4().hex[:8]}",
        status="open",
        lines={
            "items": [
                {
                    "skuId": sku,
                    "quantity": 4,
                    "lot_code": f"BATCH-{sku}",
                    "expires_at": expiry.isoformat(),
                }
            ]
        },
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    result = receive_line(
        db,
        order,
        received_quantity=4,
        actor_user_id=user.id,
        line_index=0,
    )
    db.commit()

    assert result["item_id"]
    item = db.get(Item, uuid.UUID(str(result["item_id"])))
    assert item is not None
    assert item.expires_at == expiry

    lot = db.exec(
        select(InventoryLot).where(InventoryLot.item_id == item.id)
    ).first()
    assert lot is not None
    assert lot.lot_code == f"BATCH-{sku}"
    assert lot.expires_at == expiry
    assert lot.status == "active"
