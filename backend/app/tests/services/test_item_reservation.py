"""P1-7: резерв товара — available/reserved, списание, отмена, конкуренция."""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

import pytest
from fastapi import HTTPException
from sqlmodel import Session, col, select

from app.core.db import engine
from app.models import Item, OutboundOrder, Warehouse, WarehouseTask
from app.services.item_reservation import (
    consume_for_task,
    item_available,
    release_for_task,
    reserve_for_task,
)
from app.services.outbound_planning import plan_outbound_picks
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


def _wh_item(db: Session, *, sku: str, qty: int) -> Item:
    try:
        db.rollback()
    except Exception:
        pass
    occupied = {
        (i.storage_row, i.storage_level, i.storage_cell_x)
        for i in db.exec(
            select(Item).where(col(Item.storage_row).is_not(None))
        ).all()
        if i.storage_row and i.storage_level and i.storage_cell_x
    }
    cell = next(
        (
            (r, lv, x)
            for r in range(1, 17)
            for lv in range(1, 5)
            for x in range(1, 21)
            if (r, lv, x) not in occupied
        ),
        None,
    )
    if cell is None:
        raise RuntimeError("нет свободной ячейки для теста")
    row, level, cell_x = cell
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


def test_reserve_consume_release_lifecycle(db: Session) -> None:
    wh = _warehouse(db)
    item = _wh_item(db, sku="RSV-LIFE", qty=10)
    task = WarehouseTask(
        warehouse_id=wh.id, task_type="pick", status="pending", payload={}
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    reserve_for_task(
        db, item_id=item.id, quantity=4, warehouse_task_id=task.id
    )
    db.commit()
    db.refresh(item)
    assert item.reserved_quantity == 4
    assert item_available(item) == 6

    consume_for_task(db, task)
    db.commit()
    db.refresh(item)
    assert item.reserved_quantity == 0
    assert item.quantity == 6
    assert item_available(item) == 6

    task2 = WarehouseTask(
        warehouse_id=wh.id, task_type="pick", status="pending", payload={}
    )
    db.add(task2)
    db.commit()
    db.refresh(task2)
    reserve_for_task(
        db, item_id=item.id, quantity=2, warehouse_task_id=task2.id
    )
    db.commit()
    db.refresh(item)
    assert item.reserved_quantity == 2
    release_for_task(db, task2)
    db.commit()
    db.refresh(item)
    assert item.reserved_quantity == 0
    assert item.quantity == 6


def test_reserve_rejects_over_available(db: Session) -> None:
    wh = _warehouse(db)
    item = _wh_item(db, sku="RSV-OVER", qty=3)
    task = WarehouseTask(
        warehouse_id=wh.id, task_type="pick", status="pending", payload={}
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    with pytest.raises(HTTPException) as ei:
        reserve_for_task(
            db, item_id=item.id, quantity=5, warehouse_task_id=task.id
        )
    assert ei.value.status_code == 409
    assert "доступно" in (ei.value.detail or "").lower()


def test_plan_reserves_stock(db: Session) -> None:
    wh = _warehouse(db)
    sku = f"RSV-PLAN-{uuid.uuid4().hex[:8]}"
    item = _wh_item(db, sku=sku, qty=5)
    order = OutboundOrder(
        warehouse_id=wh.id,
        code=f"OUT-RSV-{uuid.uuid4().hex[:8]}",
        status="open",
        lines={"items": [{"skuId": sku, "quantity": 3}]},
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    stats = plan_outbound_picks(db, order)
    db.commit()
    db.refresh(item)
    assert stats["created"] == 1
    assert item.reserved_quantity == 3
    assert item_available(item) == 2


def test_concurrent_reserve_second_fails(db: Session) -> None:
    """Два параллельных резерва на один остаток — второй получает 409."""
    wh = _warehouse(db)
    item = _wh_item(db, sku="RSV-RACE", qty=5)
    item_id = item.id
    wh_id = wh.id

    def _try_reserve(qty: int) -> str:
        with Session(engine) as s:
            task = WarehouseTask(
                warehouse_id=wh_id, task_type="pick", status="pending", payload={}
            )
            s.add(task)
            s.commit()
            s.refresh(task)
            try:
                reserve_for_task(
                    s, item_id=item_id, quantity=qty, warehouse_task_id=task.id
                )
                s.commit()
                return "ok"
            except HTTPException as exc:
                s.rollback()
                return f"err:{exc.status_code}"

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(_try_reserve, 5), pool.submit(_try_reserve, 5)]
        results = [f.result() for f in as_completed(futures)]

    assert results.count("ok") == 1
    assert results.count("err:409") == 1
    db.refresh(item)
    # перечитать из БД
    fresh = db.get(Item, item_id)
    assert fresh is not None
    assert fresh.reserved_quantity == 5
    assert item_available(fresh) == 0
