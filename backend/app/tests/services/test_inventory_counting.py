"""P1-10: инвентаризация — расхождение и идемпотентное проведение акта."""

from __future__ import annotations

import uuid

from sqlmodel import Session, col, select

from app.models import (
    DomainEvent,
    Item,
    Warehouse,
    WarehouseSlotOccupancy,
    WarehouseTask,
)
from app.services.inventory_counting import create_count, enter_facts, post_act
from app.tests.utils.item import create_random_item
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


def _free_cell(db: Session) -> tuple[int, int, int]:
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
    for row in range(16, 0, -1):
        for level in range(4, 0, -1):
            for cell_x in range(20, 0, -1):
                if (row, level, cell_x) not in occupied:
                    return row, level, cell_x
    raise RuntimeError("нет свободной ячейки")


def _stock(db: Session, *, qty: int) -> Item:
    row, level, cell_x = _free_cell(db)
    item = create_random_item(db)
    item.sku = f"CNT-{uuid.uuid4().hex[:8]}"
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


def test_count_variance_updates_stock_and_emits_event(db: Session) -> None:
    _warehouse(db)
    user = create_random_user(db)
    item = _stock(db, qty=10)

    act = create_count(
        db,
        warehouse_id=None,
        mode="selective",
        reason="Выборочный пересчёт",
        line_inputs=[{"item_id": item.id}],
        actor_user_id=user.id,
    )
    db.commit()
    db.refresh(act)

    lines = enter_facts(
        db,
        act,
        facts=[{"item_id": item.id, "counted_quantity": 8}],
    )
    db.commit()
    assert lines[0].counted_qty == 8
    assert lines[0].variance == -2

    act, lines, idempotent = post_act(
        db, act, actor_user_id=user.id, reason="Недостача при пересчёте"
    )
    db.commit()
    assert idempotent is False
    assert act.status == "posted"
    assert lines[0].variance == -2

    db.refresh(item)
    assert item.quantity == 8

    occ = db.exec(
        select(WarehouseSlotOccupancy).where(
            WarehouseSlotOccupancy.item_id == item.id
        )
    ).first()
    assert occ is not None

    events = list(
        db.exec(
            select(DomainEvent).where(DomainEvent.aggregate_id == act.id)
        ).all()
    )
    types = {e.event_type for e in events}
    assert "inventory.counted" in types
    assert "inventory.adjusted" in types
    counted = next(e for e in events if e.event_type == "inventory.counted")
    assert counted.payload.get("meta", {}).get("variance") == -2

    task = db.get(WarehouseTask, act.warehouse_task_id)
    assert task is not None
    assert task.task_type == "count"
    assert task.status == "completed"


def test_repost_same_act_is_idempotent(db: Session) -> None:
    _warehouse(db)
    user = create_random_user(db)
    item = _stock(db, qty=10)

    act = create_count(
        db,
        warehouse_id=None,
        mode="cycle",
        reason=None,
        line_inputs=[{"item_id": item.id}],
        actor_user_id=user.id,
    )
    enter_facts(
        db, act, facts=[{"item_id": item.id, "counted_quantity": 8}]
    )
    post_act(db, act, actor_user_id=user.id)
    db.commit()
    db.refresh(item)
    assert item.quantity == 8

    events_before = list(
        db.exec(
            select(DomainEvent).where(DomainEvent.aggregate_id == act.id)
        ).all()
    )

    act2, _, idempotent = post_act(db, act, actor_user_id=user.id)
    db.commit()
    db.refresh(item)

    assert idempotent is True
    assert act2.status == "posted"
    assert item.quantity == 8

    events_after = list(
        db.exec(
            select(DomainEvent).where(DomainEvent.aggregate_id == act.id)
        ).all()
    )
    assert len(events_after) == len(events_before)
