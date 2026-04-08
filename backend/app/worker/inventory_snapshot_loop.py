"""Periodic inventory snapshot: daily aggregation of item counts/quantities."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlmodel import Session, func, select

from app.core.db import engine
from app.models import InventorySnapshot, Item, Warehouse

logger = logging.getLogger(__name__)

SNAPSHOT_INTERVAL_SEC = 3600
SNAPSHOT_LABEL = "daily_auto"


def _get_default_warehouse_id(session: Session) -> str | None:
    wh = session.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    return str(wh.id) if wh else None


def compute_inventory_snapshot(session: Session) -> bool:
    """Build and persist a snapshot. Returns True if a new snapshot was created."""

    wh = session.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if wh is None:
        logger.warning("No default warehouse found, skipping inventory snapshot")
        return False

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    existing = session.exec(
        select(InventorySnapshot)
        .where(
            InventorySnapshot.warehouse_id == wh.id,
            InventorySnapshot.label == SNAPSHOT_LABEL,
            InventorySnapshot.taken_at >= today_start,
        )
    ).first()
    if existing is not None:
        return False

    total_items = session.exec(select(func.count()).select_from(Item)).one()
    total_quantity = session.exec(
        select(func.coalesce(func.sum(Item.quantity), 0)).select_from(Item)
    ).one()

    status_rows = session.exec(
        select(Item.status, func.count(Item.id), func.coalesce(func.sum(Item.quantity), 0))
        .group_by(Item.status)
    ).all()
    by_status = {
        status: {"count": int(cnt), "quantity": int(qty)}
        for status, cnt, qty in status_rows
    }

    snapshot_data = {
        "total_items": int(total_items),
        "total_quantity": int(total_quantity),
        "by_status": by_status,
    }

    snap = InventorySnapshot(
        warehouse_id=wh.id,
        label=SNAPSHOT_LABEL,
        taken_at=now,
        snapshot=snapshot_data,
    )
    session.add(snap)
    session.commit()
    logger.info(
        "Inventory snapshot created: items=%s quantity=%s",
        total_items,
        total_quantity,
    )
    return True


async def inventory_snapshot_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            with Session(engine) as session:
                compute_inventory_snapshot(session)
        except Exception:
            logger.exception("Inventory snapshot tick failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=SNAPSHOT_INTERVAL_SEC)
        except TimeoutError:
            continue
