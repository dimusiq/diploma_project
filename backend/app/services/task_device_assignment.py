"""Назначение складского задания на каноническую технику (wsim_device)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session

from app.models import WarehouseTask
from app.services.canonical_equipment import require_canonical_device


def assigned_device_id_from_payload(payload: dict[str, Any] | None) -> uuid.UUID | None:
    if not isinstance(payload, dict):
        return None
    raw = payload.get("assigned_device_id") or payload.get("device_id")
    if raw is None or raw == "":
        return None
    try:
        return uuid.UUID(str(raw))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422, detail="assigned_device_id должен быть UUID"
        ) from exc


def assign_warehouse_task_device(
    session: Session,
    task: WarehouseTask,
    device_id: uuid.UUID | None,
) -> WarehouseTask:
    """
    Пишет/чистит payload.assigned_device_id.
    device_id=None снимает назначение. Не коммитит.
    """
    payload = dict(task.payload) if isinstance(task.payload, dict) else {}
    if device_id is None:
        payload.pop("assigned_device_id", None)
        payload.pop("device_id", None)
    else:
        device = require_canonical_device(session, device_id, allow_archived=False)
        payload["assigned_device_id"] = str(device.id)
        payload["assigned_device_name"] = device.name
        payload["assigned_device_code"] = device.code
    task.payload = payload
    session.add(task)
    return task


def normalize_task_device_assignment(
    session: Session, task: WarehouseTask
) -> uuid.UUID | None:
    """Валидирует device из payload (если задан) и нормализует ключи."""
    device_id = assigned_device_id_from_payload(
        task.payload if isinstance(task.payload, dict) else None
    )
    if device_id is None:
        return None
    assign_warehouse_task_device(session, task, device_id)
    return device_id
