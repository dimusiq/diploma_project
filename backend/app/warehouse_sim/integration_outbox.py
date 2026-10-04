"""
Durable outbox: simulation integration_queue → WMS.

Паттерн: каждое событие в savepoint; ошибка одного не откатывает соседей.
Backoff через ``next_attempt_at``; ``done`` чистится ретеншеном (P0-5/P1-6).
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, or_, text
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, col, select

from app.realtime.item_sse_hub import publish_items_changed
from app.realtime.twin_stream_hub import (
    publish_item_movement,
    publish_occupancy_changed,
    publish_telemetry_fact,
)
from app.warehouse_sim.integration_context import _DomainCtx
from app.warehouse_sim.integration_handlers import _apply_one
from app.warehouse_sim.integration_schemas import SOURCE
from app.warehouse_sim.models import (
    OUTBOX_DEAD_LETTER,
    OUTBOX_DONE,
    OUTBOX_PENDING,
    SimIntegrationOutbox,
)
from app.warehouse_sim.timeutil import utcnow

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 10
DEFAULT_BATCH_LIMIT = 200
# Верхняя граница backoff между попытками (сек).
_BACKOFF_CAP_SEC = 300.0


def make_event_key(rec: dict[str, Any]) -> str:
    """Стабильный ключ идемпотентности: sim seq + type, иначе хеш payload."""
    ev = rec.get("event") if isinstance(rec.get("event"), dict) else {}
    seq = ev.get("id") if ev else rec.get("id")
    typ = str(rec.get("type") or (ev.get("type") if ev else "") or "")
    if seq is not None and str(seq) != "":
        return f"{seq}:{typ}"[:128]
    blob = json.dumps(rec, sort_keys=True, default=str, ensure_ascii=False)
    return ("h:" + hashlib.sha256(blob.encode("utf-8")).hexdigest()[:40])[:128]


def _sim_seq_of(rec: dict[str, Any]) -> int:
    ev = rec.get("event") if isinstance(rec.get("event"), dict) else {}
    raw = ev.get("id") if ev else rec.get("id")
    try:
        return int(raw or 0)
    except (TypeError, ValueError):
        return 0


def backoff_seconds(attempts: int) -> float:
    """Экспоненциальный backoff после N-й неудачной попытки (attempts уже увеличен)."""
    n = max(1, int(attempts))
    return min(_BACKOFF_CAP_SEC, float(2 ** (n - 1)))


def ensure_enqueued(session: Session, records: list[dict[str, Any]]) -> int:
    """Пишет записи в outbox (ON CONFLICT DO NOTHING). Возвращает число вставок."""
    if not records:
        return 0
    inserted = 0
    now = utcnow()
    for rec in records:
        key = make_event_key(rec)
        stmt = (
            insert(SimIntegrationOutbox)
            .values(
                id=uuid.uuid4(),
                event_key=key,
                sim_seq=_sim_seq_of(rec),
                payload=rec,
                status=OUTBOX_PENDING,
                attempts=0,
                last_error=None,
                created_at=now,
                completed_at=None,
                next_attempt_at=now,
            )
            .on_conflict_do_nothing(index_elements=["event_key"])
            .returning(col(SimIntegrationOutbox.id))
        )
        row = session.execute(stmt).fetchone()
        if row is not None:
            inserted += 1
    return inserted


def fetch_pending(
    session: Session,
    *,
    limit: int = DEFAULT_BATCH_LIMIT,
    now: datetime | None = None,
) -> list[SimIntegrationOutbox]:
    """Берёт due pending с SKIP LOCKED (учитывает next_attempt_at)."""
    now = now or utcnow()
    stmt = (
        select(SimIntegrationOutbox)
        .where(
            SimIntegrationOutbox.status == OUTBOX_PENDING,
            or_(
                col(SimIntegrationOutbox.next_attempt_at).is_(None),
                col(SimIntegrationOutbox.next_attempt_at) <= now,
            ),
        )
        .order_by(
            col(SimIntegrationOutbox.sim_seq), col(SimIntegrationOutbox.created_at)
        )
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    return list(session.exec(stmt).all())


def outbox_counts(session: Session) -> dict[str, int]:
    """Метрики: pending / done / dead_letter / lag."""
    rows = session.exec(
        select(SimIntegrationOutbox.status, func.count()).group_by(
            SimIntegrationOutbox.status
        )
    ).all()
    by_status = {str(status): int(cnt) for status, cnt in rows}
    pending = by_status.get(OUTBOX_PENDING, 0)
    return {
        "pending": pending,
        "done": by_status.get(OUTBOX_DONE, 0),
        "dead_letter": by_status.get(OUTBOX_DEAD_LETTER, 0),
        "lag": pending,
    }


def _record_failure(session: Session, row_id: uuid.UUID, error: str) -> str:
    """
    Увеличивает attempts у одной строки, ставит backoff или dead_letter.

    Возвращает ``\"requeued\"`` | ``\"dead_letter\"`` | ``\"skipped\"``.
    """
    fresh = session.get(SimIntegrationOutbox, row_id)
    if fresh is None or fresh.status != OUTBOX_PENDING:
        return "skipped"
    now = utcnow()
    fresh.attempts = int(fresh.attempts or 0) + 1
    fresh.last_error = (error or "apply_failed")[:2048]
    if fresh.attempts >= MAX_ATTEMPTS:
        fresh.status = OUTBOX_DEAD_LETTER
        fresh.completed_at = now
        fresh.next_attempt_at = None
        session.add(fresh)
        return "dead_letter"
    delay = backoff_seconds(fresh.attempts)
    fresh.next_attempt_at = now + timedelta(seconds=delay)
    session.add(fresh)
    return "requeued"


def process_integration_outbox(
    session: Session,
    world: dict[str, Any],
    *,
    limit: int = DEFAULT_BATCH_LIMIT,
) -> tuple[dict[str, int], list[str]]:
    """
    Применяет due pending по одному событию (savepoint на каждое).

    Ошибка одного не откатывает соседей и не увеличивает их attempts.
    """
    rows = fetch_pending(session, limit=limit)
    if not rows:
        return (
            {
                "applied": 0,
                "errors": 0,
                "requeued": 0,
                "commits": 0,
                "dead_letter": 0,
            },
            [],
        )

    ctx = _DomainCtx.from_session(session, world)
    touched_items: set[uuid.UUID] = set()
    touched_tasks: set[uuid.UUID] = set()
    orders_changed = False
    occupancy_changed = False
    applied = 0
    errors = 0
    requeued = 0
    dead_letter = 0
    done_keys: list[str] = []

    for row in rows:
        row_id = row.id
        event_key = row.event_key
        try:
            with session.begin_nested():
                fresh = session.get(SimIntegrationOutbox, row_id)
                if fresh is None or fresh.status != OUTBOX_PENDING:
                    continue
                rec = dict(fresh.payload or {})
                result = _apply_one(ctx, rec) or {}
                if result.get("item_id"):
                    touched_items.add(result["item_id"])
                if result.get("task_id"):
                    touched_tasks.add(result["task_id"])
                orders_changed = orders_changed or bool(result.get("orders"))
                occupancy_changed = occupancy_changed or bool(result.get("occupancy"))
                fresh.status = OUTBOX_DONE
                fresh.completed_at = utcnow()
                fresh.last_error = None
                fresh.next_attempt_at = None
                session.add(fresh)
            applied += 1
            done_keys.append(event_key)
        except Exception as exc:
            errors += 1
            outcome = _record_failure(session, row_id, str(exc))
            if outcome == "requeued":
                requeued += 1
            elif outcome == "dead_letter":
                dead_letter += 1
            logger.exception(
                "warehouse_sim integration outbox event failed key=%s",
                event_key,
            )

    session.commit()
    if applied:
        _publish_after_apply(
            item_ids=touched_items,
            task_ids=touched_tasks,
            orders=orders_changed,
            occupancy=occupancy_changed,
        )
    return (
        {
            "applied": applied,
            "errors": errors,
            "requeued": requeued,
            "commits": 1 if (applied or errors) else 0,
            "dead_letter": dead_letter,
        },
        done_keys,
    )


def prune_done_integration_outbox(
    session: Session, *, cutoff: datetime, batch_size: int
) -> int:
    """Удаляет ``done``-строки старше cutoff (тот же ретеншен, что P0-5 outbox-done)."""
    result = session.execute(
        text(
            """
            DELETE FROM wsim_integration_outbox
            WHERE id IN (
                SELECT id FROM wsim_integration_outbox
                WHERE status = 'done'
                  AND completed_at IS NOT NULL
                  AND completed_at < :cutoff
                ORDER BY completed_at
                LIMIT :lim
            )
            """
        ),
        {"cutoff": cutoff, "lim": batch_size},
    )
    return int(result.rowcount or 0)


def _publish_after_apply(
    *,
    item_ids: set[uuid.UUID],
    task_ids: set[uuid.UUID],
    orders: bool,
    occupancy: bool,
) -> None:
    # Локальный publish, чтобы не тянуть integration.py (цикл импортов).
    if item_ids:
        publish_items_changed()
        for iid in list(item_ids)[:12]:
            publish_item_movement(item_id=iid, reason="warehouse_sim")
    if occupancy:
        publish_occupancy_changed()
    if orders or task_ids:
        publish_telemetry_fact(
            event_type="wms.demo_sync",
            payload={"source": SOURCE, "orders": orders, "tasks": bool(task_ids)},
        )


def prune_memory_queue(world: dict[str, Any], done_keys: set[str] | list[str]) -> int:
    """Удаляет из memory-очереди только успешно применённые ключи."""
    keys = set(done_keys)
    if not keys:
        return 0
    queue = list(world.get("integration_queue") or [])
    kept = [rec for rec in queue if make_event_key(rec) not in keys]
    removed = len(queue) - len(kept)
    world["integration_queue"] = kept
    return removed
