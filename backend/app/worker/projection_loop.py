"""Периодический полный пересчёт проекции занятости ячеек (самовосстановление)."""

from __future__ import annotations

import asyncio
import logging

from sqlmodel import Session

from app.core.db import engine
from app.realtime.twin_stream_hub import publish_occupancy_changed
from app.services.warehouse_slot_projection import refresh_warehouse_slot_projection

logger = logging.getLogger(__name__)

PROJECTION_RECONCILE_INTERVAL_SEC = 3600


async def warehouse_projection_reconcile_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            with Session(engine) as session:
                n = refresh_warehouse_slot_projection(session)
                session.commit()
            publish_occupancy_changed()
            logger.info("Warehouse slot projection refreshed (%s rows)", n)
        except Exception:
            logger.exception("Warehouse slot projection refresh failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=PROJECTION_RECONCILE_INTERVAL_SEC)
        except asyncio.TimeoutError:
            continue
