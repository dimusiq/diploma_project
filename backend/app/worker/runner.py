"""
Точка входа воркера: планировщик отчётов (тот же цикл, что раньше жил в FastAPI).

Запуск: `uv run python -m app.worker` (из каталога backend).
Требуются те же переменные окружения, что и у API (Postgres, SMTP при отправке писем).
"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys

from app.core.config import settings
from app.core.report_scheduler import report_scheduler_loop
from app.worker.projection_loop import (
    PROJECTION_RECONCILE_INTERVAL_SEC,
    warehouse_projection_reconcile_loop,
)

logger = logging.getLogger(__name__)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
    )
    if not settings.emails_enabled:
        logger.warning(
            "SMTP не настроен (emails_enabled=False): планировщик отчётов не будет отправлять письма."
        )

    redis_url = settings.REDIS_URL

    async def _run() -> None:
        stop = asyncio.Event()

        def _stop() -> None:
            stop.set()

        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, _stop)
            except NotImplementedError:
                # Windows и часть сред без SIGTERM handler
                pass

        logger.info(
            "Worker started (report scheduler + warehouse projection reconcile every %ss)",
            PROJECTION_RECONCILE_INTERVAL_SEC,
        )
        await asyncio.gather(
            report_scheduler_loop(stop, redis_url=redis_url),
            warehouse_projection_reconcile_loop(stop),
        )
        logger.info("Worker stopped")

    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        pass
