"""
Резерв остатков Item под задания отбора.

Инвариант: available = quantity - reserved_quantity ≥ 0.
Не связан с резервом запчастей (WorkOrderPartReservation).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models import Item, ItemReservation, WarehouseTask

RESERVATION_ACTIVE = "active"
RESERVATION_CONSUMED = "consumed"
RESERVATION_RELEASED = "released"


def item_available(item: Item) -> int:
    return max(0, int(item.quantity or 0) - int(item.reserved_quantity or 0))


def _lock_item(session: Session, item_id: uuid.UUID) -> Item:
    item = session.exec(
        select(Item).where(Item.id == item_id).with_for_update()
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Товар не найден")
    return item


def reserve_for_task(
    session: Session,
    *,
    item_id: uuid.UUID,
    quantity: int,
    warehouse_task_id: uuid.UUID,
    outbound_order_id: uuid.UUID | None = None,
) -> ItemReservation:
    """Резерв под задачу. 409, если available < quantity. Идемпотентно по task_id."""
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Количество резерва должно быть > 0")

    existing = session.exec(
        select(ItemReservation).where(
            ItemReservation.warehouse_task_id == warehouse_task_id
        )
    ).first()
    if existing is not None and existing.status == RESERVATION_ACTIVE:
        return existing
    if existing is not None and existing.status == RESERVATION_CONSUMED:
        return existing

    item = _lock_item(session, item_id)
    available = item_available(item)
    if quantity > available:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Недостаточно доступного остатка: доступно {available} "
                f"(остаток {item.quantity}, уже зарезервировано {item.reserved_quantity}), "
                f"запрошено {quantity}"
            ),
        )
    item.reserved_quantity = int(item.reserved_quantity or 0) + quantity
    session.add(item)
    now = datetime.now(timezone.utc)
    if existing is not None and existing.status == RESERVATION_RELEASED:
        # повторный резерв после инцидента (blocked → ok)
        existing.item_id = item.id
        existing.outbound_order_id = outbound_order_id
        existing.quantity = quantity
        existing.status = RESERVATION_ACTIVE
        existing.updated_at = now
        session.add(existing)
        session.flush()
        return existing
    row = ItemReservation(
        item_id=item.id,
        warehouse_task_id=warehouse_task_id,
        outbound_order_id=outbound_order_id,
        quantity=quantity,
        status=RESERVATION_ACTIVE,
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    session.flush()
    return row


def consume_for_task(session: Session, task: WarehouseTask) -> bool:
    """Подтверждение отбора: списать quantity и снять резерв. True если было active."""
    row = session.exec(
        select(ItemReservation).where(
            ItemReservation.warehouse_task_id == task.id,
            ItemReservation.status == RESERVATION_ACTIVE,
        )
    ).first()
    if row is None:
        return False
    item = _lock_item(session, row.item_id)
    qty = int(row.quantity)
    reserved = int(item.reserved_quantity or 0)
    on_hand = int(item.quantity or 0)
    item.reserved_quantity = max(0, reserved - qty)
    item.quantity = max(0, on_hand - qty)
    row.status = RESERVATION_CONSUMED
    row.updated_at = datetime.now(timezone.utc)
    session.add(item)
    session.add(row)
    session.flush()
    return True


def release_for_task(session: Session, task: WarehouseTask) -> bool:
    """Отмена/провал задачи: снять резерв без списания остатка."""
    row = session.exec(
        select(ItemReservation).where(
            ItemReservation.warehouse_task_id == task.id,
            ItemReservation.status == RESERVATION_ACTIVE,
        )
    ).first()
    if row is None:
        return False
    item = _lock_item(session, row.item_id)
    qty = int(row.quantity)
    item.reserved_quantity = max(0, int(item.reserved_quantity or 0) - qty)
    row.status = RESERVATION_RELEASED
    row.updated_at = datetime.now(timezone.utc)
    session.add(item)
    session.add(row)
    session.flush()
    return True


def apply_task_status_to_stock(session: Session, task: WarehouseTask) -> None:
    """Вызывается после смены статуса WarehouseTask."""
    if task.task_type != "pick":
        return
    status = (task.status or "").lower()
    if status in {"completed", "done"}:
        consume_for_task(session, task)
    elif status in {"cancelled", "canceled", "failed", "error", "blocked"}:
        release_for_task(session, task)
