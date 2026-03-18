"""
Встроенный планировщик email-отчётов.

Почему так:
- без внешнего cron/Celery/RQ (проще для учебного проекта)
- “достаточно коммерчески”: регулярность + идемпотентность через лог отправок

Важно:
- при запуске нескольких воркеров Uvicorn/Gunicorn каждый воркер поднимет loop.
  Дубли не уйдут из-за уникальности по периоду (ReportEmailDeliveryLog), но нагрузка вырастет.
"""

import asyncio
from datetime import datetime, timezone

from sqlmodel import Session

from app.core.db import engine
from app.services.report_email_service import send_due_reports


async def report_scheduler_loop(stop_event: asyncio.Event) -> None:
    # Проверяем раз в 5 минут, но отчёты привязаны к часу (09:00 UTC).
    while not stop_event.is_set():
        now = datetime.now(timezone.utc)
        try:
            with Session(engine) as session:
                send_due_reports(session, now)
        except Exception:
            # не роняем цикл — следующая итерация попробует снова
            pass
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=300)
        except asyncio.TimeoutError:
            continue

