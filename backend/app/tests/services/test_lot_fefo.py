"""P3-18: FEFO — порядок отбора и запрет отгрузки просрочки."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import Session, col, select

from app.core.config import settings
from app.models import InventoryLot, Item, OutboundOrder, User, Warehouse
from app.services.lot_fefo import (
    ensure_lot_for_item,
    is_expired,
    pick_lots_for_fefo_test,
    today_utc,
)
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
    for row in range(1, 17):
        for level in range(1, 5):
            for cell_x in range(1, 21):
                if (row, level, cell_x) not in occupied:
                    return row, level, cell_x
    raise RuntimeError("нет свободной ячейки для теста")


def _stock_with_expiry(
    db: Session,
    *,
    warehouse_id: uuid.UUID,
    sku: str,
    qty: int,
    expires: date | None,
    lot_code: str,
) -> Item:
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
    item.expires_at = expires
    db.add(item)
    db.flush()
    ensure_lot_for_item(
        db,
        warehouse_id=warehouse_id,
        item=item,
        quantity=qty,
        lot_code=lot_code,
        expires_at=expires,
    )
    db.commit()
    db.refresh(item)
    return item


def test_fefo_pure_earlier_lot_first() -> None:
    day = date(2026, 10, 4)
    order = pick_lots_for_fefo_test(
        [
            ("LATE", day + timedelta(days=30), 5),
            ("EARLY", day + timedelta(days=5), 5),
            ("MID", day + timedelta(days=10), 5),
            ("EXPIRED", day - timedelta(days=1), 5),
        ],
        need=6,
        on=day,
    )
    assert order[0] == "EARLY"
    assert "EXPIRED" not in order


def test_is_expired_boundary() -> None:
    day = today_utc()
    assert is_expired(day - timedelta(days=1), on=day) is True
    assert is_expired(day, on=day) is False
    assert is_expired(None, on=day) is False


def test_plan_prefers_earlier_expiry_lot(db: Session) -> None:
    wh = _warehouse(db)
    suffix = uuid.uuid4().hex[:6]
    sku = f"FEFO-{suffix}"
    day = today_utc()
    early = _stock_with_expiry(
        db,
        warehouse_id=wh.id,
        sku=sku,
        qty=3,
        expires=day + timedelta(days=3),
        lot_code=f"LOT-E-{suffix}",
    )
    _stock_with_expiry(
        db,
        warehouse_id=wh.id,
        sku=sku,
        qty=3,
        expires=day + timedelta(days=40),
        lot_code=f"LOT-L-{suffix}",
    )

    order = OutboundOrder(
        warehouse_id=wh.id,
        code=f"OUT-FEFO-{suffix}",
        status="open",
        lines={"items": [{"skuId": sku, "quantity": 2}]},
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    stats = plan_outbound_picks(db, order)
    db.commit()
    assert stats["created"] == 1

    from app.services.outbound_fulfillment import related_tasks

    picks = [t for t in related_tasks(db, order) if t.task_type == "pick"]
    assert len(picks) == 1
    payload = picks[0].payload or {}
    assert payload.get("item_id") == str(early.id)
    assert payload.get("pick_policy") == "FEFO"
    assert payload.get("lot_code") == f"LOT-E-{suffix}"


def test_expired_excluded_from_pick_plan(db: Session) -> None:
    wh = _warehouse(db)
    suffix = uuid.uuid4().hex[:6]
    sku = f"EXP-{suffix}"
    day = today_utc()
    _stock_with_expiry(
        db,
        warehouse_id=wh.id,
        sku=sku,
        qty=5,
        expires=day - timedelta(days=2),
        lot_code=f"LOT-X-{suffix}",
    )

    order = OutboundOrder(
        warehouse_id=wh.id,
        code=f"OUT-EXP-{suffix}",
        status="open",
        lines={"items": [{"skuId": sku, "quantity": 2}]},
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    stats = plan_outbound_picks(db, order)
    db.commit()
    assert stats["created"] == 0
    assert len(stats["shortage_lines"]) == 1


def test_ship_blocks_expired_item(db: Session) -> None:
    wh = _warehouse(db)
    user = create_random_user(db)
    shipper = db.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    assert shipper is not None

    suffix = uuid.uuid4().hex[:6]
    sku = f"SHIPX-{suffix}"
    day = today_utc()
    # Планируем с ещё валидным сроком, затем «протухаем» партию перед ship.
    item = _stock_with_expiry(
        db,
        warehouse_id=wh.id,
        sku=sku,
        qty=4,
        expires=day + timedelta(days=1),
        lot_code=f"LOT-S-{suffix}",
    )

    order = OutboundOrder(
        warehouse_id=wh.id,
        code=f"OUT-SHIPX-{suffix}",
        status="open",
        lines={"items": [{"skuId": sku, "quantity": 2}]},
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    plan_outbound_picks(db, order)
    db.commit()
    from app.services.outbound_fulfillment import related_tasks

    picks = [t for t in related_tasks(db, order) if t.task_type == "pick"]
    assert len(picks) == 1
    confirm_pick(
        db,
        order,
        task_id=picks[0].id,
        actor_user_id=user.id,
        scanned_code=sku,
    )
    db.commit()
    db.refresh(order)
    pack_order(db, order, actor_user_id=user.id)
    db.commit()

    item.expires_at = day - timedelta(days=1)
    db.add(item)
    lot = db.exec(
        select(InventoryLot).where(InventoryLot.item_id == item.id)
    ).first()
    assert lot is not None
    lot.expires_at = day - timedelta(days=1)
    db.add(lot)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        ship_order(db, shipper, order.id)
    assert exc.value.status_code == 409
    assert "просроч" in str(exc.value.detail).lower()
