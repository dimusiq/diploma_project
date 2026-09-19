"""ТО для wsim_device: не CMMS technique/equipment."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, col, select

from app.warehouse_sim.models import (
    MAINT_PRIORITIES,
    MAINT_PRIORITY_MEDIUM,
    MAINT_STATUS_CANCELLED,
    MAINT_STATUS_COMPLETED,
    MAINT_STATUS_IN_PROGRESS,
    MAINT_STATUS_PLANNED,
    MAINT_STATUSES,
    MAINT_TYPES,
    SimDevice,
    SimDeviceMaintenance,
)

OPEN_STATUSES = (
    MAINT_STATUS_PLANNED,
    "scheduled",
    MAINT_STATUS_IN_PROGRESS,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def serialize_maintenance(row: SimDeviceMaintenance) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "device_id": str(row.device_id),
        "type": row.type,
        "status": row.status,
        "title": row.title,
        "description": row.description,
        "priority": row.priority,
        "scheduled_at": _iso(row.scheduled_at),
        "started_at": _iso(row.started_at),
        "completed_at": _iso(row.completed_at),
        "performed_by": row.performed_by,
        "notes": row.notes,
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
    }


def list_maintenance(session: Session, device_id: uuid.UUID) -> list[SimDeviceMaintenance]:
    return list(
        session.exec(
            select(SimDeviceMaintenance)
            .where(SimDeviceMaintenance.device_id == device_id)
            .order_by(col(SimDeviceMaintenance.created_at).desc())
        ).all()
    )


def get_maintenance(session: Session, record_id: uuid.UUID) -> SimDeviceMaintenance:
    row = session.get(SimDeviceMaintenance, record_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Запись ТО не найдена")
    return row


def _parse_dt(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def create_maintenance(session: Session, device: SimDevice, body: dict[str, Any]) -> SimDeviceMaintenance:
    kind = str(body.get("type") or "")
    if kind not in MAINT_TYPES:
        raise HTTPException(status_code=400, detail="Неподдерживаемый тип ТО")
    status = str(body.get("status") or MAINT_STATUS_PLANNED)
    if status not in MAINT_STATUSES:
        raise HTTPException(status_code=400, detail="Неподдерживаемый статус ТО")
    title = str(body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Название ТО не может быть пустым")
    priority = str(body.get("priority") or MAINT_PRIORITY_MEDIUM)
    if priority not in MAINT_PRIORITIES:
        raise HTTPException(status_code=400, detail="Неподдерживаемый приоритет")
    now = _utcnow()
    row = SimDeviceMaintenance(
        device_id=device.id,
        type=kind,
        status=status,
        title=title[:256],
        description=str(body["description"])[:4096] if body.get("description") else None,
        priority=priority,
        scheduled_at=_parse_dt(body.get("scheduled_at")),
        started_at=_parse_dt(body.get("started_at")) or (now if status == MAINT_STATUS_IN_PROGRESS else None),
        completed_at=_parse_dt(body.get("completed_at")),
        performed_by=str(body["performed_by"])[:128] if body.get("performed_by") else None,
        notes=str(body["notes"])[:2048] if body.get("notes") else None,
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def patch_maintenance(
    session: Session, record_id: uuid.UUID, body: dict[str, Any]
) -> SimDeviceMaintenance:
    row = get_maintenance(session, record_id)
    if "type" in body and body["type"] is not None:
        kind = str(body["type"])
        if kind not in MAINT_TYPES:
            raise HTTPException(status_code=400, detail="Неподдерживаемый тип ТО")
        row.type = kind
    if "status" in body and body["status"] is not None:
        status = str(body["status"])
        if status not in MAINT_STATUSES:
            raise HTTPException(status_code=400, detail="Неподдерживаемый статус ТО")
        row.status = status
        if status == MAINT_STATUS_IN_PROGRESS and row.started_at is None:
            row.started_at = _utcnow()
        if status in (MAINT_STATUS_COMPLETED, MAINT_STATUS_CANCELLED) and row.completed_at is None:
            row.completed_at = _utcnow()
    if "title" in body and body["title"] is not None:
        title = str(body["title"]).strip()
        if not title:
            raise HTTPException(status_code=400, detail="Название ТО не может быть пустым")
        row.title = title[:256]
    if "description" in body:
        row.description = str(body["description"])[:4096] if body["description"] else None
    if "priority" in body and body["priority"] is not None:
        priority = str(body["priority"])
        if priority not in MAINT_PRIORITIES:
            raise HTTPException(status_code=400, detail="Неподдерживаемый приоритет")
        row.priority = priority
    if "scheduled_at" in body:
        row.scheduled_at = _parse_dt(body["scheduled_at"])
    if "performed_by" in body:
        row.performed_by = str(body["performed_by"])[:128] if body["performed_by"] else None
    if "notes" in body:
        row.notes = str(body["notes"])[:2048] if body["notes"] else None
    row.updated_at = _utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def maintenance_summary(session: Session, device_id: uuid.UUID) -> dict[str, Any]:
    rows = list_maintenance(session, device_id)
    return _summary_from_rows(rows)


def maintenance_summaries(
    session: Session, device_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict[str, Any]]:
    if not device_ids:
        return {}
    rows = list(
        session.exec(
            select(SimDeviceMaintenance).where(
                col(SimDeviceMaintenance.device_id).in_(device_ids)
            )
        ).all()
    )
    by_device: dict[uuid.UUID, list[SimDeviceMaintenance]] = {did: [] for did in device_ids}
    for row in rows:
        by_device.setdefault(row.device_id, []).append(row)
    return {did: _summary_from_rows(items) for did, items in by_device.items()}


def _summary_from_rows(rows: list[SimDeviceMaintenance]) -> dict[str, Any]:
    now = _utcnow()
    soon = now + timedelta(days=7)
    completed = [r for r in rows if r.status == MAINT_STATUS_COMPLETED and r.completed_at]
    last = max(completed, key=lambda r: r.completed_at or r.created_at) if completed else None
    upcoming = [
        r
        for r in rows
        if r.status in OPEN_STATUSES and r.scheduled_at is not None
    ]
    next_row = min(upcoming, key=lambda r: r.scheduled_at or now) if upcoming else None
    overdue = [
        r
        for r in upcoming
        if r.scheduled_at is not None and r.scheduled_at < now and r.status != MAINT_STATUS_IN_PROGRESS
    ]
    in_progress = any(r.status == MAINT_STATUS_IN_PROGRESS for r in rows)
    due_soon = bool(
        next_row
        and next_row.scheduled_at
        and now <= next_row.scheduled_at <= soon
        and not overdue
        and not in_progress
    )
    if in_progress:
        tone = "in_progress"
    elif overdue:
        tone = "overdue"
    elif due_soon:
        tone = "due_soon"
    else:
        tone = "ok"
    return {
        "count": len(rows),
        "overdueCount": len(overdue),
        "lastAt": _iso(last.completed_at if last else None),
        "nextAt": _iso(next_row.scheduled_at if next_row else None),
        "status": next_row.status if next_row else (last.status if last else None),
        "tone": tone,
    }


def has_open_in_progress(session: Session, device_id: uuid.UUID) -> bool:
    row = session.exec(
        select(SimDeviceMaintenance).where(
            SimDeviceMaintenance.device_id == device_id,
            SimDeviceMaintenance.status == MAINT_STATUS_IN_PROGRESS,
        )
    ).first()
    return row is not None
