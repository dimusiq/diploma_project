"""Камеры оборудования (vision) в warehouse_sim API."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.warehouse_sim.router_common import (
    CurrentUser,
    SessionDep,
    SimAdmin,
    _camera_device,
    _require_camera,
)
from app.warehouse_sim.runtime import get_runtime
from app.warehouse_sim.schemas import CameraControlBody

router = APIRouter()


@router.get("/equipment/{equipment_id}/camera")
@router.get("/equipment/{equipment_id}/camera/status")
def read_equipment_camera(
    session: SessionDep, _user: CurrentUser, equipment_id: str
) -> dict[str, Any]:
    from app.warehouse_sim.vision.service import public_camera

    return public_camera(_camera_device(session, equipment_id))


@router.get("/equipment/{equipment_id}/camera/detections")
def read_equipment_camera_detections(
    session: SessionDep, _user: CurrentUser, equipment_id: str
) -> dict[str, Any]:
    device = _camera_device(session, equipment_id)
    camera = _require_camera(device)
    detections = list(camera.get("detections") or [])
    return {
        "data": detections,
        "count": len(detections),
        "description": camera.get("description") or "",
        "obstacle": bool(camera.get("obstacle")),
    }


@router.get("/equipment/{equipment_id}/camera/frame")
def read_equipment_camera_frame(
    session: SessionDep, _user: CurrentUser, equipment_id: str
) -> dict[str, Any]:
    from app.warehouse_sim.vision.service import frame_payload

    device = _camera_device(session, equipment_id)
    _require_camera(device)
    return frame_payload(device)


@router.post("/equipment/{equipment_id}/camera/control")
def control_equipment_camera(
    session: SessionDep,
    _admin: SimAdmin,
    equipment_id: str,
    body: CameraControlBody,
) -> dict[str, Any]:
    device = _camera_device(session, equipment_id)
    _require_camera(device)
    try:
        return get_runtime().control_camera(
            device["id"],
            body.action,
            body.confidence_threshold,
            body.class_name,
            body.entity_id,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Устройство не найдено") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
