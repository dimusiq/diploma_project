"""Фоновый цикл ретеншена журналов событий (domain_event / twin / wsim)."""

from __future__ import annotations

import asyncio
import logging

from sqlmodel import Session

from app.core.config import settings
from app.core.db import engine
from app.services.event_retention import run_event_retention

logger = logging.getLogger(__name__)


async def event_retention_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        if settings.EVENT_RETENTION_ENABLED:
            try:
                with Session(engine) as session:
                    stats = run_event_retention(session)
                    deleted_total = sum(stats["deleted"].values())
                    if deleted_total:
                        logger.info(
                            "Event retention tick: deleted_total=%s remaining=%s",
                            deleted_total,
                            stats["remaining"],
                        )
            except Exception:
                logger.exception("Event retention tick failed")
        try:
            await asyncio.wait_for(
                stop_event.wait(),
                timeout=float(settings.EVENT_RETENTION_INTERVAL_SEC),
            )
        except asyncio.TimeoutError:
            continue
