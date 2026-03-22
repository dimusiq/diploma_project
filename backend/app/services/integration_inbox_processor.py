"""Очередь integration_inbox → доменные мутации, domain_event, twin SSE."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Final

from sqlmodel import Session, col, select

from app.core.config import settings
from app.events import catalog
from app.models import DomainEvent, IntegrationInbox
from app.realtime.twin_stream_hub import publish_telemetry_fact
from app.services import integration_inbox_handlers as h

logger = logging.getLogger(__name__)

TWIN_ONLY: Final = "__TWIN_ONLY__"

# Внешние имена событий → доменный тип (или маркер только realtime).
INTEGRATION_EVENT_ALIASES: dict[str, str] = {
    "integration.telemetry": TWIN_ONLY,
    "wms.goods_receipt": catalog.EVENT_INVENTORY_RECEIVED,
    "wms.putaway.complete": catalog.EVENT_INVENTORY_PUTAWAY_COMPLETED,
    "wms.putaway.completed": catalog.EVENT_INVENTORY_PUTAWAY_COMPLETED,
    "wms.inventory.move": catalog.EVENT_INVENTORY_MOVED,
    "wms.pick.complete": catalog.EVENT_INVENTORY_PICKED,
    "wms.ship.confirm": catalog.EVENT_INVENTORY_SHIPPED,
    "wms.task.created": catalog.EVENT_TASK_CREATED,
    "wms.task.started": catalog.EVENT_TASK_STARTED,
    "wms.task.paused": catalog.EVENT_TASK_PAUSED,
    "wms.task.completed": catalog.EVENT_TASK_COMPLETED,
    "wms.task.failed": catalog.EVENT_TASK_FAILED,
    "wms.queue.depth": catalog.EVENT_QUEUE_DEPTH_UPDATED,
    "equipment.pose": catalog.EVENT_EQUIPMENT_POSITION_UPDATED,
    "equipment.battery": catalog.EVENT_EQUIPMENT_BATTERY_UPDATED,
    "wms.alert.raise": catalog.EVENT_ALERT_RAISED,
    "wms.alert.resolve": catalog.EVENT_ALERT_RESOLVED,
    "wms.slot.block": catalog.EVENT_SLOT_BLOCKED,
    "wms.slot.unblock": catalog.EVENT_SLOT_UNBLOCKED,
}


def resolve_inbox_event_type(integration_event_type: str) -> str:
    return INTEGRATION_EVENT_ALIASES.get(integration_event_type, integration_event_type)


def _dispatch(session: Session, row: IntegrationInbox, domain_type: str) -> DomainEvent | None:
    if domain_type == TWIN_ONLY:
        return None
    if domain_type in h.INVENTORY_EVENT_TYPES:
        return h.handle_inventory_typed(session, row, domain_type)
    if domain_type in h.SLOT_EVENT_TYPES:
        return h.handle_slot_event(session, row, domain_type)
    if domain_type == catalog.EVENT_EQUIPMENT_POSITION_UPDATED:
        return h.handle_equipment_position(session, row)
    if domain_type == catalog.EVENT_EQUIPMENT_BATTERY_UPDATED:
        return h.handle_equipment_battery(session, row)
    if domain_type in h.TASK_EVENT_TYPES:
        return h.handle_task_lifecycle(session, row, domain_type)
    if domain_type == catalog.EVENT_QUEUE_DEPTH_UPDATED:
        return h.handle_queue_depth(session, row)
    if domain_type in (catalog.EVENT_ALERT_RAISED, catalog.EVENT_ALERT_RESOLVED):
        return h.handle_alert(session, row, domain_type)
    raise ValueError(f"Неподдерживаемый тип после маппинга: {domain_type}")


def _publish_inbox_twin(row: IntegrationInbox, domain_event_id: uuid.UUID | None) -> None:
    payload: dict[str, Any] = {
        "integration_inbox_id": str(row.id),
        "source": row.source,
        "event_type": row.event_type,
        "payload": row.payload,
    }
    if domain_event_id is not None:
        payload["domain_event_id"] = str(domain_event_id)
    publish_telemetry_fact(event_type=f"integration.{row.event_type}", payload=payload)


def process_integration_inbox_batch(session: Session, *, limit: int = 30) -> dict[str, int]:
    """
    Берёт pending-строки (FOR UPDATE SKIP LOCKED), применяет доменную логику, коммитит.
    Возвращает счётчики processed / failed / twin_only / ignored_duplicate.
    """
    if not bool(getattr(settings, "INTEGRATION_INBOX_DOMAIN_ENABLED", True)):
        return {"processed": 0, "failed": 0, "twin_only": 0, "ignored_duplicate": 0}

    stmt = (
        select(IntegrationInbox)
        .where(IntegrationInbox.status == "pending")
        .order_by(col(IntegrationInbox.created_at))
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    rows = list(session.exec(stmt).all())
    pending_ids = [r.id for r in rows]
    processed = failed = twin_only = ignored_duplicate = 0
    now = datetime.now(timezone.utc)

    for rid in pending_ids:
        row = session.get(IntegrationInbox, rid)
        if row is None or row.status != "pending":
            continue
        try:
            if row.idempotency_key:
                dup = session.exec(
                    select(IntegrationInbox).where(
                        IntegrationInbox.source == row.source,
                        IntegrationInbox.idempotency_key == row.idempotency_key,
                        IntegrationInbox.status == "processed",
                        IntegrationInbox.id != rid,
                    )
                ).first()
                if dup is not None:
                    row.status = "ignored_duplicate"
                    row.processed_at = now
                    row.domain_event_id = dup.domain_event_id
                    row.processing_error = None
                    session.add(row)
                    session.commit()
                    ignored_duplicate += 1
                    continue

            domain_type = resolve_inbox_event_type(row.event_type)
            ev = _dispatch(session, row, domain_type)
            row.status = "processed"
            row.processed_at = now
            row.processing_error = None
            row.domain_event_id = ev.id if ev is not None else None
            row.twin_published_at = now
            session.add(row)
            session.commit()

            de_id = row.domain_event_id
            session.refresh(row)
            _publish_inbox_twin(row, de_id)
            if domain_type == TWIN_ONLY:
                twin_only += 1
            else:
                processed += 1
        except Exception as e:
            session.rollback()
            failed += 1
            err = str(e)[:4000]
            logger.warning("integration_inbox %s failed: %s", rid, err)
            try:
                r2 = session.get(IntegrationInbox, rid)
                if r2 is not None and r2.status == "pending":
                    r2.status = "failed"
                    r2.processing_error = err
                    r2.processed_at = now
                    session.add(r2)
                    session.commit()
            except Exception:
                session.rollback()
                logger.exception("Could not mark integration_inbox %s failed", rid)

    return {
        "processed": processed,
        "failed": failed,
        "twin_only": twin_only,
        "ignored_duplicate": ignored_duplicate,
    }
