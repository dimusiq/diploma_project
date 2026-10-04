"""Назначение умных камер на мобильную технику склада.

Камера — обычный wsim_device (kind=smart_camera). Связь хранится в
wsim_smart_camera_assignment. Runtime vision (detections / cameraHold) живёт
на host-устройстве (AGV/AMR/forklift), а не на инвентарной камере.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.warehouse_sim.equipment_catalog import TASK_CAPABLE_KINDS
from app.warehouse_sim.fleet import TYPE_TO_KIND, get_device_row
from app.warehouse_sim.models import (
    DEVICE_SMART_CAMERA,
    DEVICE_STATUS_MAINTENANCE,
    DEVICE_STATUS_OFFLINE,
    DEVICE_STATUS_ONLINE,
    SimDevice,
    SimSmartCameraAssignment,
)
from app.warehouse_sim.timeutil import iso_utc, utcnow
from app.warehouse_sim.vision.service import camera_spec, public_camera

KIND_SMART_CAMERA = "smart_camera"

DEMO_CAMERA_SPECS = (
    {
        "code": "cam-1",
        "name": "CAM-001",
        "description": "Умная камера CAM-001",
        "serial": "SN-CAM-001",
        "host_code": "agv-1",
        "x": 20.0,
        "z": 14.0,
    },
    {
        "code": "cam-2",
        "name": "CAM-002",
        "description": "Умная камера CAM-002",
        "serial": "SN-CAM-002",
        "host_code": None,
        "x": 22.0,
        "z": 14.0,
    },
    {
        "code": "cam-3",
        "name": "CAM-003",
        "description": "Умная камера CAM-003",
        "serial": "SN-CAM-003",
        "host_code": None,
        "x": 24.0,
        "z": 14.0,
    },
)


def is_smart_camera(row: SimDevice) -> bool:
    meta = row.meta or {}
    kind = str(meta.get("kind") or TYPE_TO_KIND.get(row.device_type) or "")
    return row.device_type == DEVICE_SMART_CAMERA or kind == KIND_SMART_CAMERA


def is_camera_host(row: SimDevice) -> bool:
    meta = row.meta or {}
    kind = str(meta.get("kind") or TYPE_TO_KIND.get(row.device_type) or "")
    return kind in TASK_CAPABLE_KINDS


def device_status_label(row: SimDevice, runtime: dict[str, Any] | None = None) -> str:
    meta = row.meta or {}
    if row.archived or not row.enabled:
        return "offline"
    if meta.get("inMaintenance") or row.status == DEVICE_STATUS_MAINTENANCE:
        return "maintenance"
    if runtime:
        if runtime.get("online") is False or runtime.get("status") == "offline":
            return "offline"
        return "online"
    if row.status == DEVICE_STATUS_OFFLINE:
        return "offline"
    return "online"


def active_assignment_for_camera(
    session: Session, camera_device_id: uuid.UUID
) -> SimSmartCameraAssignment | None:
    return session.exec(
        select(SimSmartCameraAssignment).where(
            SimSmartCameraAssignment.camera_device_id == camera_device_id,
            col(SimSmartCameraAssignment.unassigned_at).is_(None),
        )
    ).first()


def active_assignment_for_host(
    session: Session, host_device_id: uuid.UUID
) -> SimSmartCameraAssignment | None:
    return session.exec(
        select(SimSmartCameraAssignment).where(
            SimSmartCameraAssignment.host_device_id == host_device_id,
            col(SimSmartCameraAssignment.unassigned_at).is_(None),
        )
    ).first()


def active_assignments_by_host(
    session: Session, *, host_ids: list[uuid.UUID] | None = None
) -> dict[uuid.UUID, SimSmartCameraAssignment]:
    stmt = select(SimSmartCameraAssignment).where(
        col(SimSmartCameraAssignment.unassigned_at).is_(None)
    )
    if host_ids is not None:
        if not host_ids:
            return {}
        stmt = stmt.where(col(SimSmartCameraAssignment.host_device_id).in_(host_ids))
    rows = list(session.exec(stmt).all())
    return {row.host_device_id: row for row in rows}


def active_assignments_by_camera(
    session: Session, *, camera_ids: list[uuid.UUID] | None = None
) -> dict[uuid.UUID, SimSmartCameraAssignment]:
    stmt = select(SimSmartCameraAssignment).where(
        col(SimSmartCameraAssignment.unassigned_at).is_(None)
    )
    if camera_ids is not None:
        if not camera_ids:
            return {}
        stmt = stmt.where(
            col(SimSmartCameraAssignment.camera_device_id).in_(camera_ids)
        )
    rows = list(session.exec(stmt).all())
    return {row.camera_device_id: row for row in rows}


def list_available_cameras(session: Session) -> list[dict[str, Any]]:
    from app.warehouse_sim.fleet import demo_warehouse

    warehouse = demo_warehouse(session)
    if warehouse is None:
        return []
    rows = list(
        session.exec(
            select(SimDevice).where(
                SimDevice.warehouse_id == warehouse.id,
                SimDevice.device_type == DEVICE_SMART_CAMERA,
                col(SimDevice.archived).is_(False),
            )
        ).all()
    )
    busy = active_assignments_by_camera(session, camera_ids=[row.id for row in rows])
    out: list[dict[str, Any]] = []
    for row in rows:
        if row.id in busy:
            continue
        if not row.enabled:
            continue
        meta = row.meta or {}
        out.append(
            {
                "device_id": str(row.id),
                "code": row.code,
                "name": row.name,
                "status": device_status_label(row),
                "model": meta.get("model") or "Scene camera",
                "resolution": meta.get("resolution"),
                "fps": meta.get("targetFps") or meta.get("fps"),
                "last_signal_at": meta.get("lastSignalAt"),
            }
        )
    out.sort(key=lambda item: item["code"])
    return out


def camera_payload(
    session: Session,
    *,
    host: SimDevice,
    assignment: SimSmartCameraAssignment | None = None,
    runtime: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    link = assignment or active_assignment_for_host(session, host.id)
    if link is None:
        return None
    camera = session.get(SimDevice, link.camera_device_id)
    if camera is None:
        return None
    meta = camera.meta or {}
    host_rt = runtime or {}
    cam_public = None
    if isinstance(host_rt.get("camera"), dict) and host_rt["camera"].get("installed"):
        cam_public = public_camera(host_rt)
    return {
        "device_id": str(camera.id),
        "code": camera.code,
        "name": camera.name,
        "status": device_status_label(
            camera, host_rt if host_rt.get("camera") else None
        ),
        "online": bool((cam_public or {}).get("online"))
        if cam_public
        else device_status_label(camera) == "online",
        "fps": (cam_public or {}).get("fps")
        or meta.get("targetFps")
        or meta.get("fps")
        or 0,
        "detection_count": (cam_public or {}).get("detection_count") or 0,
        "last_signal_at": (cam_public or {}).get("last_frame_at")
        or meta.get("lastSignalAt"),
        "model": meta.get("model") or (cam_public or {}).get("model") or "Scene camera",
        "resolution": meta.get("resolution"),
        "assigned_at": iso_utc(link.assigned_at),
        "host": {
            "id": str(host.id),
            "code": host.code,
            "name": host.name,
        },
        "runtime": cam_public,
    }


def host_payload(session: Session, camera: SimDevice) -> dict[str, Any] | None:
    link = active_assignment_for_camera(session, camera.id)
    if link is None:
        return None
    host = session.get(SimDevice, link.host_device_id)
    if host is None:
        return None
    return {
        "id": str(host.id),
        "code": host.code,
        "name": host.name,
        "kind": str(
            (host.meta or {}).get("kind") or TYPE_TO_KIND.get(host.device_type) or ""
        ),
    }


def assign_smart_camera(
    session: Session,
    *,
    host: SimDevice,
    camera_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
    previous_camera_id: uuid.UUID | None = None,
    notes: str | None = None,
) -> SimSmartCameraAssignment:
    if not is_camera_host(host):
        raise HTTPException(
            status_code=400,
            detail="Умную камеру можно закрепить только за AGV, AMR или погрузчиком",
        )
    if host.archived:
        raise HTTPException(status_code=409, detail="Техника архивирована")
    camera = get_device_row(session, camera_id)
    if not is_smart_camera(camera):
        raise HTTPException(
            status_code=400, detail="Устройство не является умной камерой"
        )
    if camera.archived:
        raise HTTPException(status_code=409, detail="Камера архивирована")
    if not camera.enabled:
        raise HTTPException(status_code=409, detail="Камера отключена")
    if active_assignment_for_host(session, host.id) is not None:
        raise HTTPException(
            status_code=409,
            detail=f"У техники {host.code} уже закреплена умная камера",
        )
    busy = active_assignment_for_camera(session, camera.id)
    if busy is not None:
        other = session.get(SimDevice, busy.host_device_id)
        other_code = other.code if other else "?"
        raise HTTPException(
            status_code=409,
            detail=f"Камера {camera.code} уже закреплена за другой техникой ({other_code}).",
        )
    assignment = SimSmartCameraAssignment(
        camera_device_id=camera.id,
        host_device_id=host.id,
        assigned_at=utcnow(),
        assigned_by_user_id=user_id,
        previous_camera_id=previous_camera_id,
        notes=notes,
    )
    session.add(assignment)
    try:
        session.flush()
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail=f"Камера {camera.code} уже закреплена за другой техникой.",
        ) from exc
    return assignment


def unassign_smart_camera(
    session: Session,
    *,
    host: SimDevice,
) -> SimSmartCameraAssignment | None:
    assignment = active_assignment_for_host(session, host.id)
    if assignment is None:
        return None
    assignment.unassigned_at = utcnow()
    session.add(assignment)
    session.flush()
    return assignment


def replace_smart_camera(
    session: Session,
    *,
    host: SimDevice,
    new_camera_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
) -> SimSmartCameraAssignment:
    current = active_assignment_for_host(session, host.id)
    previous_id = current.camera_device_id if current else None
    if current is not None:
        if current.camera_device_id == new_camera_id:
            return current
        current.unassigned_at = utcnow()
        session.add(current)
        session.flush()
    return assign_smart_camera(
        session,
        host=host,
        camera_id=new_camera_id,
        user_id=user_id,
        previous_camera_id=previous_id,
        notes="replace" if previous_id else None,
    )


def enrich_fleet_payload(
    session: Session,
    payload: dict[str, Any],
    row: SimDevice,
    *,
    host_assignments: dict[uuid.UUID, SimSmartCameraAssignment] | None = None,
    camera_assignments: dict[uuid.UUID, SimSmartCameraAssignment] | None = None,
) -> dict[str, Any]:
    payload.setdefault("smart_camera", None)
    payload.setdefault("mounted_on", None)
    if is_camera_host(row):
        map_ = host_assignments
        if map_ is None:
            map_ = active_assignments_by_host(session, host_ids=[row.id])
        link = map_.get(row.id)
        if link is not None:
            payload["smart_camera"] = camera_payload(
                session, host=row, assignment=link, runtime=None
            )
            # Подмешать runtime-камеру из payload, если есть.
            rt_cam = (payload.get("runtime") or {}).get("camera")
            if isinstance(rt_cam, dict) and payload["smart_camera"]:
                payload["smart_camera"]["runtime"] = rt_cam
                payload["smart_camera"]["online"] = bool(rt_cam.get("online"))
                payload["smart_camera"]["fps"] = rt_cam.get("fps") or 0
                payload["smart_camera"]["detection_count"] = (
                    rt_cam.get("detection_count") or 0
                )
                payload["smart_camera"]["last_signal_at"] = rt_cam.get(
                    "last_frame_at"
                ) or payload["smart_camera"].get("last_signal_at")
                if rt_cam.get("camera_code"):
                    payload["smart_camera"]["code"] = rt_cam["camera_code"]
    if is_smart_camera(row):
        map_ = camera_assignments
        if map_ is None:
            map_ = active_assignments_by_camera(session, camera_ids=[row.id])
        link = map_.get(row.id)
        if link is not None:
            host = session.get(SimDevice, link.host_device_id)
            if host is not None:
                payload["mounted_on"] = {
                    "id": str(host.id),
                    "code": host.code,
                    "name": host.name,
                    "kind": str(
                        (host.meta or {}).get("kind")
                        or TYPE_TO_KIND.get(host.device_type)
                        or ""
                    ),
                }
    return payload


def apply_camera_to_host(
    host_runtime: dict[str, Any],
    *,
    camera_row: SimDevice | None,
    installed: bool,
) -> None:
    if not installed or camera_row is None:
        existing = host_runtime.get("camera")
        if isinstance(existing, dict) and existing.get("installed"):
            # Сохраняем структуру, но снимаем установку.
            host_runtime["camera"] = camera_spec(installed=False)
            host_runtime["cameraHold"] = False
            host_runtime["cameraHoldReason"] = None
        return
    cam = host_runtime.get("camera")
    if not isinstance(cam, dict) or not cam.get("installed"):
        cam = camera_spec(installed=True)
        host_runtime["camera"] = cam
    else:
        cam["installed"] = True
    cam["deviceUuid"] = str(camera_row.id)
    cam["camera_code"] = camera_row.code
    cam["camera_name"] = camera_row.name
    meta = camera_row.meta or {}
    if meta.get("model"):
        cam["model"] = meta["model"]
    if meta.get("targetFps") or meta.get("fps"):
        cam["target_fps"] = meta.get("targetFps") or meta.get("fps")
    if meta.get("resolution"):
        cam["resolution"] = meta["resolution"]


def sync_runtime_camera_links(session: Session, world: dict[str, Any]) -> None:
    """Ставит/снимает runtime camera.installed на host по активным назначениям."""
    links = list(
        session.exec(
            select(SimSmartCameraAssignment).where(
                col(SimSmartCameraAssignment.unassigned_at).is_(None)
            )
        ).all()
    )
    by_host_uuid: dict[str, SimSmartCameraAssignment] = {
        str(link.host_device_id): link for link in links
    }
    cameras = {
        str(row.id): row
        for row in session.exec(
            select(SimDevice).where(SimDevice.device_type == DEVICE_SMART_CAMERA)
        ).all()
    }
    hosts = {
        str(row.id): row
        for row in session.exec(select(SimDevice)).all()
        if is_camera_host(row)
    }
    # Сопоставление runtime id (code) ↔ uuid.
    code_to_uuid = {row.code: str(row.id) for row in hosts.values()}
    world["smartCameraLinks"] = [
        {
            "hostId": hosts[str(link.host_device_id)].code
            if str(link.host_device_id) in hosts
            else None,
            "hostUuid": str(link.host_device_id),
            "cameraId": cameras[str(link.camera_device_id)].code
            if str(link.camera_device_id) in cameras
            else None,
            "cameraUuid": str(link.camera_device_id),
        }
        for link in links
        if str(link.host_device_id) in hosts and str(link.camera_device_id) in cameras
    ]
    devices = world.get("deviceById") or {}
    assigned_host_codes = {
        item["hostId"] for item in world["smartCameraLinks"] if item.get("hostId")
    }
    for code, device in list(devices.items()):
        kind = device.get("kind")
        if kind not in TASK_CAPABLE_KINDS:
            continue
        host_uuid = code_to_uuid.get(code)
        link = by_host_uuid.get(host_uuid) if host_uuid else None
        if link is None or code not in assigned_host_codes:
            # Не трогаем hardcoded demo-камеру юнит-тестов без UUID-привязки,
            # если устройство ещё не из persistent fleet.
            if host_uuid and isinstance(device.get("camera"), dict):
                if device["camera"].get("deviceUuid") or device["camera"].get(
                    "fromAssignment"
                ):
                    apply_camera_to_host(device, camera_row=None, installed=False)
            elif host_uuid:
                # Persistent host без назначения — камера не установлена.
                apply_camera_to_host(device, camera_row=None, installed=False)
            continue
        camera_row = cameras.get(str(link.camera_device_id))
        apply_camera_to_host(device, camera_row=camera_row, installed=True)
        if isinstance(device.get("camera"), dict):
            device["camera"]["fromAssignment"] = True


def apply_camera_positions(world: dict[str, Any]) -> None:
    """Зеркалит позицию host на назначенную инвентарную камеру."""
    links = world.get("smartCameraLinks") or []
    if not links:
        return
    devices = world.get("deviceById") or {}
    now_iso = iso_utc(utcnow())
    for link in links:
        host = devices.get(link.get("hostId") or "")
        camera = devices.get(link.get("cameraId") or "")
        if host is None or camera is None:
            continue
        if camera.get("kind") != KIND_SMART_CAMERA:
            continue
        if host.get("pos"):
            camera["pos"] = dict(host["pos"])
            camera["current_zone"] = host.get("current_zone") or host.get("zoneId")
            camera["lastSignalAt"] = now_iso
            camera["locationStale"] = False
            camera["online"] = bool(camera.get("enabled", True))
            if camera.get("enabled", True) and not camera.get("inMaintenance"):
                camera["status"] = "idle"


def ensure_demo_smart_cameras(session: Session, warehouse_id: uuid.UUID) -> None:
    """Создаёт демо-камеры и назначение CAM-001 → AGV-01."""
    from app.warehouse_sim.fleet import KIND_TO_TYPE, persist_meta
    from app.warehouse_sim.world import create_device

    now = utcnow()
    for spec in DEMO_CAMERA_SPECS:
        row = session.exec(
            select(SimDevice).where(
                SimDevice.warehouse_id == warehouse_id,
                SimDevice.code == spec["code"],
            )
        ).first()
        if row is None:
            device = create_device(
                str(spec["code"]),
                KIND_SMART_CAMERA,
                str(spec["name"]),
                {"x": float(str(spec["x"])), "z": float(str(spec["z"]))},
                zoneId="zone-storage",
                serialNumber=spec["serial"],
                model="Scene camera",
                targetFps=24,
                resolution="1280x720",
            )
            row = SimDevice(
                warehouse_id=warehouse_id,
                code=spec["code"],
                name=spec["name"],
                description=spec["description"],
                device_type=KIND_TO_TYPE[KIND_SMART_CAMERA],
                enabled=True,
                archived=False,
                status=DEVICE_STATUS_ONLINE,
                battery=None,
                x=spec["x"],
                y=spec["z"],
                home_x=spec["x"],
                home_y=spec["z"],
                speed_mps=0.0,
                meta=persist_meta(device),
                created_at=now,
                updated_at=now,
            )
            session.add(row)
            session.flush()
        host_code = spec.get("host_code")
        if not host_code:
            continue
        if active_assignment_for_camera(session, row.id):
            continue
        host = session.exec(
            select(SimDevice).where(
                SimDevice.warehouse_id == warehouse_id,
                SimDevice.code == host_code,
            )
        ).first()
        if host is None or active_assignment_for_host(session, host.id):
            continue
        session.add(
            SimSmartCameraAssignment(
                camera_device_id=row.id,
                host_device_id=host.id,
                assigned_at=now,
                notes="demo seed",
            )
        )
    session.flush()
