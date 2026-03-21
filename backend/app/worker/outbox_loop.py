"""Фоновый цикл: доставка доменных событий из transactional outbox в проекции."""

from __future__ import annotations

import asyncio
import logging

from sqlmodel import Session

from app.core.db import engine
from app.services.outbox_dispatch import process_outbox_batch

logger = logging.getLogger(__name__)

OUTBOX_POLL_INTERVAL_SEC = 2.0


async def outbox_dispatcher_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            with Session(engine) as session:
                stats = process_outbox_batch(session, limit=100)
                if stats["batch_taken"] or stats["failed"]:
                    logger.info(
                        "Outbox batch: taken=%s completed=%s failed=%s",
                        stats["batch_taken"],
                        stats["completed"],
                        stats["failed"],
                    )
                session.commit()
        except Exception:
            logger.exception("Outbox dispatcher tick failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=OUTBOX_POLL_INTERVAL_SEC)
        except TimeoutError:
            continue
