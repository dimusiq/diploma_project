"""Фоновый цикл: просрочка ТО по моточасам → наряды + уведомления."""

from __future__ import annotations

import asyncio
import logging

from sqlmodel import Session

from app.core.config import settings
from app.core.db import engine
from app.services.maintenance_auto import run_maintenance_auto_tick

logger = logging.getLogger(__name__)


async def maintenance_auto_loop(stop_event: asyncio.Event) -> None:
    interval = float(settings.MAINTENANCE_AUTO_POLL_SEC)
    while not stop_event.is_set():
        if settings.MAINTENANCE_AUTO_ENABLED:
            try:
                with Session(engine) as session:
                    stats = run_maintenance_auto_tick(session)
                if stats.get("work_orders_created") or stats.get(
                    "notifications_created"
                ):
                    logger.info("Maintenance auto tick: %s", stats)
            except Exception:
                logger.exception("maintenance_auto_loop failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue
