"""Canonical warehouse equipment is wsim_device (sim fleet), not CMMS equipment."""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlmodel import Session

from app.warehouse_sim.models import SimDevice


def get_canonical_device(session: Session, device_id: uuid.UUID) -> SimDevice | None:
    return session.get(SimDevice, device_id)


def require_canonical_device(
    session: Session,
    device_id: uuid.UUID,
    *,
    allow_archived: bool = True,
) -> SimDevice:
    row = get_canonical_device(session, device_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    if row.archived and not allow_archived:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    return row


def canonical_device_name(row: SimDevice) -> str:
    return row.name


def device_engine_hours(row: SimDevice, busy_sec: float | int | None = None) -> int | None:
    meta = dict(row.meta or {})
    raw = meta.get("engineHours")
    if raw is not None:
        try:
            return int(raw)
        except (TypeError, ValueError):
            pass
    if busy_sec is not None and float(busy_sec) > 0:
        return int(float(busy_sec) // 3600)
    return None
