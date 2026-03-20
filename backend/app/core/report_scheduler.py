"""
Планировщик email-отчётов (фоновый цикл).

Может работать в процессе FastAPI или в отдельном воркере (`python -m app.worker`).
При заданном REDIS_URL перед отправкой берётся распределённая блокировка, чтобы
не дублировать работу между несколькими воркерами Uvicorn/Gunicorn или API+worker.
"""

import asyncio
from datetime import datetime, timezone

import redis
from sqlmodel import Session

from app.core.db import engine
from app.services.report_email_service import send_due_reports

REPORT_LOCK_KEY = "nebardak:lock:report_scheduler"
LOCK_TTL_SEC = 120


async def report_scheduler_loop(
    stop_event: asyncio.Event,
    *,
    redis_url: str | None = None,
) -> None:
    r: redis.Redis | None = None
    if redis_url:
        r = redis.from_url(redis_url, decode_responses=True)

    try:
        while not stop_event.is_set():
            now = datetime.now(timezone.utc)
            acquired = True
            if r is not None:
                try:
                    acquired = bool(
                        r.set(REPORT_LOCK_KEY, "1", nx=True, ex=LOCK_TTL_SEC)
                    )
                except Exception:
                    acquired = True
            if acquired:
                try:
                    with Session(engine) as session:
                        send_due_reports(session, now)
                except Exception:
                    pass
                finally:
                    if r is not None:
                        try:
                            r.delete(REPORT_LOCK_KEY)
                        except Exception:
                            pass
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=300)
            except TimeoutError:
                continue
    finally:
        if r is not None:
            try:
                r.close()
            except Exception:
                pass
