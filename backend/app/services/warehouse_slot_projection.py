"""Синхронизация read-модели warehouse_slot_occupancy с таблицей item."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Session, delete, select

from app.core.storage_slot import format_storage_slot_key
from app.models import Item, WarehouseSlotOccupancy


def sync_projection_for_item(session: Session, item: Item) -> None:
    """Удаляет старую строку по item_id и при полной ячейке вставляет актуальную."""
    session.exec(delete(WarehouseSlotOccupancy).where(WarehouseSlotOccupancy.item_id == item.id))
    sk = format_storage_slot_key(
        item.storage_row,
        item.storage_level,
        item.storage_cell_x,
        item.storage_cell_z,
    )
    if sk is None:
        return
    session.add(
        WarehouseSlotOccupancy(
            slot_key=sk,
            item_id=item.id,
            owner_id=item.owner_id,
            updated_at=datetime.now(timezone.utc),
        )
    )


def refresh_warehouse_slot_projection(session: Session) -> int:
    """Полный пересчёт из item (идемпотентно; для воркера-сверки). Возвращает число строк."""
    session.exec(delete(WarehouseSlotOccupancy))
    n = 0
    for row in session.exec(select(Item)).all():
        sk = format_storage_slot_key(
            row.storage_row,
            row.storage_level,
            row.storage_cell_x,
            row.storage_cell_z,
        )
        if sk is None:
            continue
        session.add(
            WarehouseSlotOccupancy(
                slot_key=sk,
                item_id=row.id,
                owner_id=row.owner_id,
                updated_at=datetime.now(timezone.utc),
            )
        )
        n += 1
    return n
