"""Обработчики проекций (вызываются из outbox-диспетчера)."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, select

from app.events import catalog
from app.models import (
    DomainEvent,
    Item,
    TwinAlertOpenProjection,
    TwinEquipmentPoseProjection,
    TwinProjectionEntry,
    TwinQueueDepthProjection,
    TwinTaskStateProjection,
    WarehouseTask,
)
from app.services.warehouse_slot_projection import sync_projection_for_item

ConsumerFn = Callable[[Session, DomainEvent], None]


def _payload_summary(payload: dict[str, Any]) -> dict[str, Any]:
    keys = list(payload.keys())[:24]
    out: dict[str, Any] = {"keys": keys}
    for k in ("item_id", "warehouse_id", "task_id", "slot_key", "equipment_id", "alert_id"):
        if k in payload:
            out[k] = payload[k]
    return out


def twin_timeline_handler(session: Session, ev: DomainEvent) -> None:
    """Лента twin: идемпотентная вставка по domain_event_id."""
    stmt = (
        insert(TwinProjectionEntry.__table__)
        .values(
            id=uuid.uuid4(),
            domain_event_id=ev.id,
            event_seq=ev.event_seq,
            occurred_at=ev.occurred_at,
            event_type=ev.event_type,
            aggregate_type=ev.aggregate_type,
            aggregate_id=ev.aggregate_id,
            payload_summary=_payload_summary(ev.payload),
        )
        .on_conflict_do_nothing(index_elements=["domain_event_id"])
    )
    session.execute(stmt)


def slot_occupancy_sync_handler(session: Session, ev: DomainEvent) -> None:
    """Пересчёт occupancy по событию с item_id (инвентарь / товар)."""
    if not (
        ev.event_type.startswith("inventory.")
        or ev.event_type.startswith("item.")
    ):
        return
    raw = ev.payload.get("item_id")
    if raw is not None:
        try:
            iid = uuid.UUID(str(raw))
        except (ValueError, TypeError):
            return
    elif ev.aggregate_type == "item":
        iid = ev.aggregate_id
    else:
        return
    item = session.get(Item, iid)
    if item is None:
        return
    sync_projection_for_item(session, item)


def twin_task_state_handler(session: Session, ev: DomainEvent) -> None:
    if not ev.event_type.startswith("task."):
        return
    raw = ev.payload.get("task_id")
    if raw is None:
        return
    try:
        tid = uuid.UUID(str(raw))
    except (ValueError, TypeError):
        return
    task = session.get(WarehouseTask, tid)
    if task is None:
        return
    now = datetime.now(timezone.utc)
    stmt = (
        insert(TwinTaskStateProjection.__table__)
        .values(
            warehouse_task_id=task.id,
            warehouse_id=task.warehouse_id,
            task_type=task.task_type,
            status=task.status,
            payload=dict(ev.payload),
            updated_at=now,
            last_domain_event_id=ev.id,
        )
        .on_conflict_do_update(
            index_elements=["warehouse_task_id"],
            set_={
                "status": task.status,
                "task_type": task.task_type,
                "payload": dict(ev.payload),
                "updated_at": now,
                "last_domain_event_id": ev.id,
            },
        )
    )
    session.execute(stmt)


def twin_equipment_pose_handler(session: Session, ev: DomainEvent) -> None:
    if ev.event_type != catalog.EVENT_EQUIPMENT_POSITION_UPDATED:
        return
    raw = ev.payload.get("equipment_id")
    if raw is None:
        return
    try:
        eid = uuid.UUID(str(raw))
    except (ValueError, TypeError):
        return
    now = datetime.now(timezone.utc)
    pose = dict(ev.payload.get("pose") or {})
    wid = ev.payload.get("warehouse_id")
    wid_uuid = uuid.UUID(str(wid)) if wid else None
    src = ev.payload.get("source")
    if isinstance(src, str) and len(src) > 64:
        src = src[:64]
    stmt = (
        insert(TwinEquipmentPoseProjection.__table__)
        .values(
            equipment_id=eid,
            warehouse_id=wid_uuid,
            pose=pose,
            source=src if isinstance(src, str) else None,
            updated_at=now,
            last_domain_event_id=ev.id,
        )
        .on_conflict_do_update(
            index_elements=["equipment_id"],
            set_={
                "warehouse_id": wid_uuid,
                "pose": pose,
                "source": src if isinstance(src, str) else None,
                "updated_at": now,
                "last_domain_event_id": ev.id,
            },
        )
    )
    session.execute(stmt)


def twin_queue_depth_handler(session: Session, ev: DomainEvent) -> None:
    if ev.event_type != catalog.EVENT_QUEUE_DEPTH_UPDATED:
        return
    try:
        wid = uuid.UUID(str(ev.payload["warehouse_id"]))
        qn = str(ev.payload["queue_name"])[:64]
        depth = int(ev.payload["depth"])
    except (KeyError, ValueError, TypeError):
        return
    now = datetime.now(timezone.utc)
    stmt = (
        insert(TwinQueueDepthProjection.__table__)
        .values(
            id=uuid.uuid4(),
            warehouse_id=wid,
            queue_name=qn,
            depth=depth,
            updated_at=now,
            last_domain_event_id=ev.id,
        )
        .on_conflict_do_update(
            index_elements=["warehouse_id", "queue_name"],
            set_={
                "depth": depth,
                "updated_at": now,
                "last_domain_event_id": ev.id,
            },
        )
    )
    session.execute(stmt)


def twin_alert_open_handler(session: Session, ev: DomainEvent) -> None:
    if ev.event_type == catalog.EVENT_ALERT_RAISED:
        raw = ev.payload.get("alert_id")
        if raw is None:
            return
        try:
            aid = uuid.UUID(str(raw))
        except (ValueError, TypeError):
            return
        now = datetime.now(timezone.utc)
        ent_raw = ev.payload.get("entity_id")
        ent_id = uuid.UUID(str(ent_raw)) if ent_raw else None
        sev = ev.payload.get("severity")
        code = ev.payload.get("code")
        msg = ev.payload.get("message")
        et = ev.payload.get("entity_type")
        stmt = (
            insert(TwinAlertOpenProjection.__table__)
            .values(
                alert_id=aid,
                severity=str(sev)[:32] if sev is not None else None,
                code=str(code)[:64] if code is not None else None,
                message=str(msg)[:2048] if msg is not None else None,
                entity_type=str(et)[:64] if et is not None else None,
                entity_id=ent_id,
                raised_at=now,
                resolved_at=None,
                last_domain_event_id=ev.id,
            )
            .on_conflict_do_update(
                index_elements=["alert_id"],
                set_={
                    "severity": str(sev)[:32] if sev is not None else None,
                    "code": str(code)[:64] if code is not None else None,
                    "message": str(msg)[:2048] if msg is not None else None,
                    "entity_type": str(et)[:64] if et is not None else None,
                    "entity_id": ent_id,
                    "raised_at": now,
                    "resolved_at": None,
                    "last_domain_event_id": ev.id,
                },
            )
        )
        session.execute(stmt)
        return

    if ev.event_type == catalog.EVENT_ALERT_RESOLVED:
        raw = ev.payload.get("alert_id")
        if raw is None:
            return
        try:
            aid = uuid.UUID(str(raw))
        except (ValueError, TypeError):
            return
        row = session.exec(
            select(TwinAlertOpenProjection).where(TwinAlertOpenProjection.alert_id == aid)
        ).first()
        if row is not None:
            row.resolved_at = datetime.now(timezone.utc)
            row.last_domain_event_id = ev.id
            session.add(row)


CONSUMER_HANDLERS: dict[str, ConsumerFn] = {
    "slot_occupancy_sync": slot_occupancy_sync_handler,
    "twin_alert_open": twin_alert_open_handler,
    "twin_equipment_pose": twin_equipment_pose_handler,
    "twin_queue_depth": twin_queue_depth_handler,
    "twin_task_state": twin_task_state_handler,
    "twin_timeline": twin_timeline_handler,
}
