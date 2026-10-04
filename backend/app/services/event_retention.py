"""
Батчевое удаление устаревших журналов событий (ретеншен P0-5).

Политика (дни, настраивается в Settings):
- domain_event / twin_projection_entry — 90
- projection_consumer_processed / wsim_event / event_outbox(done) — 30

Не удаляем domain_event с незавершённым outbox (completed_at IS NULL).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlmodel import Session, col, select

from app.core.config import settings
from app.models import EventOutbox, TwinProjectionEntry
from app.warehouse_sim.models import SimEvent

logger = logging.getLogger(__name__)

_SIZE_TABLES = (
    "domain_event",
    "event_outbox",
    "projection_consumer_processed",
    "twin_projection_entry",
    "wsim_event",
)


def relation_total_bytes(session: Session, table_name: str) -> int:
    """Размер таблицы+индексов (байты) через pg_total_relation_size."""
    if table_name not in _SIZE_TABLES:
        raise ValueError(f"Недопустимая таблица для замера: {table_name}")
    row = session.execute(
        text("SELECT pg_total_relation_size(cast(:t as regclass))"),
        {"t": f"public.{table_name}"},
    ).scalar_one()
    return int(row or 0)


def _count_rows(session: Session, table_name: str) -> int:
    if table_name not in _SIZE_TABLES:
        raise ValueError(f"Недопустимая таблица: {table_name}")
    return int(
        session.execute(text(f"SELECT count(*) FROM {table_name}")).scalar_one()  # noqa: S608
    )


def _delete_by_ids(session: Session, table_sql: str, ids: list[UUID]) -> int:
    if not ids:
        return 0
    result = session.execute(
        text(f"DELETE FROM {table_sql} WHERE id = ANY(:ids)"),  # noqa: S608
        {"ids": ids},
    )
    return int(result.rowcount or 0)


def prune_completed_outbox(
    session: Session, *, cutoff: datetime, batch_size: int
) -> int:
    rows = list(
        session.exec(
            select(EventOutbox.id)
            .where(
                col(EventOutbox.completed_at).is_not(None),
                col(EventOutbox.completed_at) < cutoff,
            )
            .order_by(col(EventOutbox.completed_at))
            .limit(batch_size)
        ).all()
    )
    return _delete_by_ids(session, "event_outbox", list(rows))


def prune_projection_consumer_processed(
    session: Session, *, cutoff: datetime, batch_size: int
) -> int:
    result = session.execute(
        text(
            """
            DELETE FROM projection_consumer_processed
            WHERE (consumer_name, domain_event_id) IN (
                SELECT consumer_name, domain_event_id
                FROM projection_consumer_processed
                WHERE processed_at < :cutoff
                ORDER BY processed_at
                LIMIT :lim
            )
            """
        ),
        {"cutoff": cutoff, "lim": batch_size},
    )
    return int(result.rowcount or 0)


def prune_twin_projection_entry(
    session: Session, *, cutoff: datetime, batch_size: int
) -> int:
    rows = list(
        session.exec(
            select(TwinProjectionEntry.id)
            .where(col(TwinProjectionEntry.occurred_at) < cutoff)
            .order_by(col(TwinProjectionEntry.occurred_at))
            .limit(batch_size)
        ).all()
    )
    return _delete_by_ids(session, "twin_projection_entry", list(rows))


def prune_domain_events(session: Session, *, cutoff: datetime, batch_size: int) -> int:
    """Старые события без pending outbox (недоставленные не трогаем)."""
    result = session.execute(
        text(
            """
            DELETE FROM domain_event
            WHERE id IN (
                SELECT d.id
                FROM domain_event d
                WHERE d.occurred_at < :cutoff
                  AND NOT EXISTS (
                      SELECT 1 FROM event_outbox o
                      WHERE o.domain_event_id = d.id
                        AND o.completed_at IS NULL
                  )
                ORDER BY d.occurred_at
                LIMIT :lim
            )
            """
        ),
        {"cutoff": cutoff, "lim": batch_size},
    )
    return int(result.rowcount or 0)


def prune_wsim_events(session: Session, *, cutoff: datetime, batch_size: int) -> int:
    rows = list(
        session.exec(
            select(SimEvent.id)
            .where(col(SimEvent.occurred_at) < cutoff)
            .order_by(col(SimEvent.occurred_at))
            .limit(batch_size)
        ).all()
    )
    return _delete_by_ids(session, "wsim_event", list(rows))


def _run_batches(
    session: Session,
    *,
    name: str,
    fn: Callable[..., int],
    cutoff: datetime,
    batch_size: int,
    max_batches: int,
    deleted: dict[str, int],
) -> None:
    for _ in range(max_batches):
        n = int(fn(session, cutoff=cutoff, batch_size=batch_size))
        deleted[name] += n
        session.commit()
        if n < batch_size:
            break


def run_event_retention(
    session: Session,
    *,
    now: datetime | None = None,
    batch_size: int | None = None,
    max_batches: int | None = None,
) -> dict[str, Any]:
    """
    Один тик ретеншена: несколько батчей по каждой таблице.

    Возвращает счётчики deleted/remaining и размеры таблиц до/после.
    """
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    batch_size = batch_size or int(settings.EVENT_RETENTION_BATCH_SIZE)
    max_batches = max_batches or int(settings.EVENT_RETENTION_MAX_BATCHES_PER_TICK)

    cutoffs = {
        "domain_event": now
        - timedelta(days=int(settings.EVENT_RETENTION_DOMAIN_EVENT_DAYS)),
        "twin_projection_entry": now
        - timedelta(days=int(settings.EVENT_RETENTION_TWIN_PROJECTION_DAYS)),
        "projection_consumer_processed": now
        - timedelta(days=int(settings.EVENT_RETENTION_PROJECTION_CONSUMER_DAYS)),
        "wsim_event": now
        - timedelta(days=int(settings.EVENT_RETENTION_WSIM_EVENT_DAYS)),
        "event_outbox_done": now
        - timedelta(days=int(settings.EVENT_RETENTION_OUTBOX_DONE_DAYS)),
    }

    sizes_before = {t: relation_total_bytes(session, t) for t in _SIZE_TABLES}
    deleted = {
        "event_outbox_done": 0,
        "projection_consumer_processed": 0,
        "twin_projection_entry": 0,
        "domain_event": 0,
        "wsim_event": 0,
    }

    _run_batches(
        session,
        name="event_outbox_done",
        fn=prune_completed_outbox,
        cutoff=cutoffs["event_outbox_done"],
        batch_size=batch_size,
        max_batches=max_batches,
        deleted=deleted,
    )
    _run_batches(
        session,
        name="projection_consumer_processed",
        fn=prune_projection_consumer_processed,
        cutoff=cutoffs["projection_consumer_processed"],
        batch_size=batch_size,
        max_batches=max_batches,
        deleted=deleted,
    )
    _run_batches(
        session,
        name="twin_projection_entry",
        fn=prune_twin_projection_entry,
        cutoff=cutoffs["twin_projection_entry"],
        batch_size=batch_size,
        max_batches=max_batches,
        deleted=deleted,
    )
    _run_batches(
        session,
        name="domain_event",
        fn=prune_domain_events,
        cutoff=cutoffs["domain_event"],
        batch_size=batch_size,
        max_batches=max_batches,
        deleted=deleted,
    )
    _run_batches(
        session,
        name="wsim_event",
        fn=prune_wsim_events,
        cutoff=cutoffs["wsim_event"],
        batch_size=batch_size,
        max_batches=max_batches,
        deleted=deleted,
    )

    remaining = {t: _count_rows(session, t) for t in _SIZE_TABLES}
    sizes_after = {t: relation_total_bytes(session, t) for t in _SIZE_TABLES}

    stats: dict[str, Any] = {
        "deleted": deleted,
        "remaining": remaining,
        "sizes_before_bytes": sizes_before,
        "sizes_after_bytes": sizes_after,
        "cutoffs": {k: v.isoformat() for k, v in cutoffs.items()},
    }
    if sum(deleted.values()):
        logger.info(
            "Event retention: deleted=%s remaining=%s sizes_before=%s sizes_after=%s",
            deleted,
            remaining,
            sizes_before,
            sizes_after,
        )
    return stats
