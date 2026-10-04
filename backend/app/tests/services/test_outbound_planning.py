"""P1-6: автогенерация pick-задач из исходящего заказа."""

from __future__ import annotations

import uuid

from sqlmodel import Session, col, select

from app.models import Item, OutboundOrder, Warehouse
from app.services.outbound_fulfillment import picking_complete, related_tasks
from app.services.outbound_planning import (
    PICKING_COMPLETE_STATUS,
    plan_outbound_picks,
    sync_outbound_status_from_tasks,
)
from app.tests.utils.item import create_random_item


def _warehouse(db: Session) -> Warehouse:
    row = db.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if row:
        return row
    row = Warehouse(code="default", name="Основной склад")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _free_cell(db: Session) -> tuple[int, int, int]:
    try:
        db.rollback()
    except Exception:
        pass
    occupied = {
        (i.storage_row, i.storage_level, i.storage_cell_x)
        for i in db.exec(select(Item).where(col(Item.storage_row).is_not(None))).all()
        if i.storage_row and i.storage_level and i.storage_cell_x
    }
    for row in range(1, 17):
        for level in range(1, 5):
            for cell_x in range(1, 21):
                if (row, level, cell_x) not in occupied:
                    return row, level, cell_x
    raise RuntimeError("нет свободной ячейки для теста")


def _stock_item(
    db: Session,
    *,
    sku: str,
    qty: int,
    level: int | None = None,
    row: int | None = None,
    cell_x: int | None = None,
) -> Item:
    if row is None or level is None or cell_x is None:
        row, level, cell_x = _free_cell(db)
    item = create_random_item(db)
    item.sku = sku
    item.quantity = qty
    item.reserved_quantity = 0
    item.status = "warehouse"
    item.storage_row = row
    item.storage_level = level
    item.storage_cell_x = cell_x
    item.storage_cell_z = 1
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def test_plan_three_lines_creates_three_pick_tasks(db: Session) -> None:
    wh = _warehouse(db)
    suffix = uuid.uuid4().hex[:6]
    sku_a, sku_b, sku_c = f"A-{suffix}", f"B-{suffix}", f"C-{suffix}"
    _stock_item(db, sku=sku_a, qty=5)
    _stock_item(db, sku=sku_b, qty=5)
    _stock_item(db, sku=sku_c, qty=5)

    order = OutboundOrder(
        warehouse_id=wh.id,
        code=f"OUT-PLAN-{uuid.uuid4().hex[:8]}",
        status="open",
        lines={
            "items": [
                {"skuId": sku_a, "quantity": 2},
                {"skuId": sku_b, "quantity": 1},
                {"skuId": sku_c, "quantity": 3},
            ]
        },
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    stats = plan_outbound_picks(db, order)
    db.commit()
    db.refresh(order)

    assert stats["created"] == 3
    assert stats["shortage_lines"] == []
    assert order.status == "picking"

    tasks = related_tasks(db, order)
    picks = [t for t in tasks if t.task_type == "pick"]
    assert len(picks) == 3
    assert all(t.status == "pending" for t in picks)
    for t in picks:
        payload = t.payload or {}
        assert payload.get("slot_key")
        assert payload.get("order_id") == str(order.id)
        assert payload.get("quantity")

    for t in picks:
        t.status = "completed"
        db.add(t)
    db.commit()

    sync_outbound_status_from_tasks(db, order)
    db.commit()
    db.refresh(order)
    assert order.status == PICKING_COMPLETE_STATUS
    assert picking_complete(order, related_tasks(db, order)) is True


def test_plan_idempotent_no_duplicate_tasks(db: Session) -> None:
    wh = _warehouse(db)
    sku = f"IDEM-{uuid.uuid4().hex[:8]}"
    _stock_item(db, sku=sku, qty=10)
    order = OutboundOrder(
        warehouse_id=wh.id,
        code=f"OUT-IDEM-{uuid.uuid4().hex[:8]}",
        status="open",
        lines={"items": [{"skuId": sku, "quantity": 2}]},
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    s1 = plan_outbound_picks(db, order)
    db.commit()
    s2 = plan_outbound_picks(db, order)
    db.commit()

    assert s1["created"] == 1
    assert s2["created"] == 0
    assert s2["skipped_existing"] == 1
    picks = [t for t in related_tasks(db, order) if t.task_type == "pick"]
    assert len(picks) == 1


def test_plan_shortage_marks_order_no_task(db: Session) -> None:
    wh = _warehouse(db)
    order = OutboundOrder(
        warehouse_id=wh.id,
        code=f"OUT-SHORT-{uuid.uuid4().hex[:8]}",
        status="open",
        lines={"items": [{"skuId": "SKU-MISSING", "quantity": 4}]},
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    stats = plan_outbound_picks(db, order)
    db.commit()
    db.refresh(order)

    assert stats["created"] == 0
    assert len(stats["shortage_lines"]) == 1
    assert stats["shortage_lines"][0]["short_by"] == 4
    extra = order.extra or {}
    assert extra.get("fulfillment", {}).get("shortage") is True
    assert related_tasks(db, order) == []
