"""Фоновые задачи агента: оркестрация сессий + публикация integration_inbox в twin telemetry."""

from __future__ import annotations

import asyncio
import logging

from sqlmodel import Session

from app.core.config import settings
from app.core.db import engine
from app.services.agent_orchestration_processor import process_orchestration_jobs_batch
from app.services.integration_inbox_processor import process_integration_inbox_batch

logger = logging.getLogger(__name__)


def _orch_interval() -> float:
    return float(getattr(settings, "AGENT_ORCHESTRATION_POLL_SEC", 30) or 30)


def _inbox_domain_interval() -> float:
    return float(getattr(settings, "INTEGRATION_INBOX_DOMAIN_POLL_SEC", 5) or 5)


async def agent_orchestration_loop(stop_event: asyncio.Event) -> None:
    interval = _orch_interval()
    while not stop_event.is_set():
        try:
            with Session(engine) as session:
                n = process_orchestration_jobs_batch(session, limit=25)
            if n:
                logger.info("Agent orchestration jobs completed: %s", n)
        except Exception:
            logger.exception("agent_orchestration_loop failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except TimeoutError:
            continue


async def integration_inbox_domain_loop(stop_event: asyncio.Event) -> None:
    interval = _inbox_domain_interval()
    while not stop_event.is_set():
        try:
            with Session(engine) as session:
                stats = process_integration_inbox_batch(session, limit=30)
            if any(stats.values()):
                logger.info("Integration inbox → domain: %s", stats)
        except Exception:
            logger.exception("integration_inbox_domain_loop failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except TimeoutError:
            continue
