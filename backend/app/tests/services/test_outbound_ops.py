"""P1-9: отбор/упаковка/отгрузка как операции (scan-verify)."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from sqlmodel import Session, col, select

from app.models import Item, OutboundOrder, Warehouse, WarehouseTask
from app.services.outbound_fulfillment import ship_order
from app.services.outbound_ops import confirm_pick, pack_order
from app.services.outbound_planning import plan_outbound_picks
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
    occupied = {
        (i.storage_row, i.storage_level, i.storage_cell_x)
        for i in db.exec(
            select(Item).where(col(Item.storage_row).is_not(None))
        ).all()
        if i.storage_row and i.storage_level and i.storage_cell_x
    }
    # с конца адресного пространства — меньше пересечений с другими тестами
    for row in range(16, 0, -1):
        for level in range(4, 0, -1):
            for cell_x in range(20, 0, -1):
                if (row, level, cell_x) not in occupied:
                    return row, level, cell_x
    raise RuntimeError("нет свободной ячейки для теста")


def _stock(db: Session, *, sku: str, qty: int) -> Item:
    row, level, cell_x = _free_cell(db)
    item = create_random_item(db)
    item.sku = sku
    item.barcode = sku
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


def _order_with_three_picks(db: Session) -> tuple[OutboundOrder, list[WarehouseTask], list[Item]]:
    wh = _warehouse(db)
    # сброс после чужого IntegrityError в session-scoped db
    try:
        db.rollback()
    except Exception:
        pass
    suffix = uuid.uuid4().hex[:6]
    skus = [f"OP-{suffix}-{i}" for i in range(3)]
    items = [
        _stock(db, sku=skus[0], qty=5),
        _stock(db, sku=skus[1], qty=5),
        _stock(db, sku=skus[2], qty=5),
    ]
    order = OutboundOrder(
        warehouse_id=wh.id,
        code=f"OUT-OPS-{uuid.uuid4().hex[:8]}",
        status="open",
        lines={
            "items": [
                {"skuId": skus[0], "quantity": 2},
                {"skuId": skus[1], "quantity": 1},
                {"skuId": skus[2], "quantity": 3},
            ]
        },
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    stats = plan_outbound_picks(db, order)
    db.commit()
    assert stats["created"] == 3
    tasks = [
        t
        for t in db.exec(
            select(WarehouseTask).where(
                WarehouseTask.warehouse_id == wh.id,
                WarehouseTask.task_type == "pick",
            )
        ).all()
        if isinstance(t.payload, dict) and t.payload.get("order_id") == str(order.id)
    ]
    tasks.sort(key=lambda t: int((t.payload or {}).get("line_index") or 0))
    assert len(tasks) == 3
    db.refresh(order)
    return order, tasks, items


def test_pick_incident_blocks_ship_then_resolve_pack_ship(db: Session) -> None:
    user = create_random_user(db)
    # права на ship: суперпользователь из фикстуры ship_order проверяет can_change_status
    from app.core.config import settings
    from app.models import User

    shipper = db.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    assert shipper is not None

    order, tasks, items = _order_with_three_picks(db)

    confirm_pick(
        db,
        order,
        task_id=tasks[0].id,
        actor_user_id=user.id,
        scanned_code=items[0].sku or "",
    )
    confirm_pick(
        db,
        order,
        task_id=tasks[1].id,
        actor_user_id=user.id,
        scanned_code=items[1].sku or "",
    )
    incident = confirm_pick(
        db,
        order,
        task_id=tasks[2].id,
        actor_user_id=user.id,
        outcome="no_stock",
        reason="Пустая ячейка",
    )
    db.commit()
    assert incident["status"] == "blocked"
    assert incident["incident"] is not None

    db.refresh(order)
    with pytest.raises(HTTPException) as blocked_ship:
        ship_order(db, shipper, order.id)
    assert blocked_ship.value.status_code == 409
    assert "некомплект" in str(blocked_ship.value.detail).lower() or "инцидент" in str(
        blocked_ship.value.detail
    ).lower()

    # разрешить инцидент: повторный скан той же позиции
    db.refresh(tasks[2])
    confirm_pick(
        db,
        order,
        task_id=tasks[2].id,
        actor_user_id=user.id,
        outcome="ok",
        scanned_code=items[2].sku or "",
    )
    db.commit()
    db.refresh(order)

    pack_order(db, order, actor_user_id=user.id)
    db.commit()
    db.refresh(order)
    assert order.status == "packed"
    assert (order.extra or {}).get("fulfillment", {}).get("packed_at")

    detail = ship_order(db, shipper, order.id)
    assert detail.status == "shipped"


def test_ship_incomplete_returns_409(db: Session) -> None:
    from app.core.config import settings
    from app.models import User

    shipper = db.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    assert shipper is not None
    user = create_random_user(db)
    order, tasks, items = _order_with_three_picks(db)
    confirm_pick(
        db,
        order,
        task_id=tasks[0].id,
        actor_user_id=user.id,
        scanned_code=items[0].sku or "",
    )
    db.commit()
    with pytest.raises(HTTPException) as exc:
        ship_order(db, shipper, order.id)
    assert exc.value.status_code == 409
