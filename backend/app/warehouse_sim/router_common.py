"""Общие зависимости и хелперы HTTP API warehouse_sim."""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request

from app.api.deps import CurrentUser, SessionDep, get_current_warehouse_sim_admin
from app.core.audit import get_client_ip, log_audit
from app.models import User
from app.warehouse_sim.fleet import get_device_row
from app.warehouse_sim.runtime import get_runtime

SimAdmin = Annotated[User, Depends(get_current_warehouse_sim_admin)]

# re-export для удобства роут-модулей
__all__ = [
    "CurrentUser",
    "SessionDep",
    "SimAdmin",
    "_audit_sim",
    "_camera_device",
    "_rebind_smart_cameras",
    "_require_camera",
    "_runtime_by_code",
]


def _camera_device(session: SessionDep, equipment_id: str) -> dict[str, Any]:
    rt = get_runtime()
    device = rt.view_device(equipment_id)
    if device is None:
        try:
            device_uuid = uuid.UUID(equipment_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=404, detail="Устройство не найдено"
            ) from exc
        row = get_device_row(session, device_uuid)
        device = rt.view_device(row.code)
    if device is None:
        raise HTTPException(status_code=404, detail="Устройство не найдено")
    return device


def _require_camera(device: dict[str, Any]) -> dict[str, Any]:
    camera = device.get("camera")
    if not isinstance(camera, dict) or not camera.get("installed"):
        raise HTTPException(status_code=404, detail="Камера не установлена")
    return camera


def _runtime_by_code() -> dict[str, dict[str, Any]]:
    return get_runtime().view_devices_by_code()


def _rebind_smart_cameras() -> None:
    get_runtime().rebind_smart_cameras()


def _audit_sim(
    session: SessionDep,
    request: Request,
    user: User,
    action: str,
    details: dict[str, Any],
) -> None:
    log_audit(
        session,
        user_id=user.id,
        action=action,
        resource_type="warehouse_sim",
        details=details,
        ip_address=get_client_ip(request),
    )
    session.commit()
