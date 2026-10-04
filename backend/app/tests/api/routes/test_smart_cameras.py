"""Назначение умных камер на технику склада."""

from __future__ import annotations

from typing import Any

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import ROLE_MANAGER, ROLE_VIEWER, AuditLog
from app.tests.api.routes.test_warehouse_sim import _headers_for_role
from app.warehouse_sim.models import SimDevice, SimSmartCameraAssignment
from app.warehouse_sim.runtime import get_runtime
from app.warehouse_sim.smart_cameras import (
    KIND_SMART_CAMERA,
    active_assignment_for_camera,
    active_assignment_for_host,
)

FLEET = f"{settings.API_V1_STR}/warehouse-sim/fleet"


def _find(client: TestClient, headers: dict[str, str], code: str) -> dict[str, Any]:
    listed = client.get(FLEET, headers=headers)
    assert listed.status_code == 200, listed.text
    row = next(item for item in listed.json()["data"] if item["code"] == code)
    assert isinstance(row, dict)
    return row


def _create_camera(client: TestClient, headers: dict[str, str]) -> dict[str, Any]:
    suffix = uuid.uuid4().hex[:6]
    response = client.post(
        FLEET,
        headers=headers,
        json={
            "kind": KIND_SMART_CAMERA,
            "name": f"CAM-T{suffix.upper()}",
            "code": f"cam-t{suffix}",
            "configuration": {"serialNumber": f"SN-T{suffix}", "model": "Scene camera"},
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert isinstance(data, dict)
    return data


def test_assign_get_and_mount_sides(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    agv = _find(client, superuser_token_headers, "agv-2")
    # снять камеру с agv-1 если мешает свободе — создаём новую свободную
    camera = _create_camera(client, superuser_token_headers)

    assigned = client.post(
        f"{FLEET}/{agv['id']}/smart-camera/assign",
        headers=superuser_token_headers,
        json={"camera_id": camera["id"]},
    )
    assert assigned.status_code == 200, assigned.text
    body = assigned.json()["smart_camera"]
    assert body["code"] == camera["code"]
    assert body["host"]["code"] == "agv-2"

    host_view = client.get(
        f"{FLEET}/{agv['id']}/smart-camera", headers=superuser_token_headers
    )
    assert host_view.status_code == 200
    assert host_view.json()["smart_camera"]["device_id"] == camera["id"]

    cam_view = client.get(f"{FLEET}/{camera['id']}", headers=superuser_token_headers)
    assert cam_view.status_code == 200
    assert cam_view.json()["mounted_on"]["code"] == "agv-2"

    db.expire_all()
    actions = list(
        db.exec(
            select(AuditLog.action).where(AuditLog.action == "SMART_CAMERA_ASSIGNED")
        ).all()
    )
    assert actions

    runtime = get_runtime().world["deviceById"].get("agv-2")
    assert runtime is not None
    assert runtime.get("camera", {}).get("installed") is True
    assert runtime["camera"].get("camera_code") == camera["code"]


def test_busy_and_non_camera_rejected(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    agv1 = _find(client, superuser_token_headers, "agv-1")
    agv2 = _find(client, superuser_token_headers, "agv-2")
    cam1 = _find(client, superuser_token_headers, "cam-1")
    # cam-1 уже на agv-1 (demo seed)
    busy = client.post(
        f"{FLEET}/{agv2['id']}/smart-camera/assign",
        headers=superuser_token_headers,
        json={"camera_id": cam1["id"]},
    )
    assert busy.status_code == 409
    assert "уже закреплена" in busy.json()["detail"]

    scanner = next(
        row
        for row in client.get(FLEET, headers=superuser_token_headers).json()["data"]
        if row["kind"] == "scanner"
    )
    bad = client.post(
        f"{FLEET}/{agv2['id']}/smart-camera/assign",
        headers=superuser_token_headers,
        json={"camera_id": scanner["id"]},
    )
    assert bad.status_code == 400

    # повторное назначение на занятый host
    free = _create_camera(client, superuser_token_headers)
    again = client.post(
        f"{FLEET}/{agv1['id']}/smart-camera/assign",
        headers=superuser_token_headers,
        json={"camera_id": free["id"]},
    )
    assert again.status_code == 409


def test_archived_camera_rejected(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    agv = _find(client, superuser_token_headers, "agv-2")
    camera = _create_camera(client, superuser_token_headers)
    archived = client.delete(f"{FLEET}/{camera['id']}", headers=superuser_token_headers)
    assert archived.status_code == 200
    response = client.post(
        f"{FLEET}/{agv['id']}/smart-camera/assign",
        headers=superuser_token_headers,
        json={"camera_id": camera["id"]},
    )
    assert response.status_code == 409


def test_replace_and_unassign(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    agv = _find(client, superuser_token_headers, "agv-2")
    first = _create_camera(client, superuser_token_headers)
    second = _create_camera(client, superuser_token_headers)

    client.post(
        f"{FLEET}/{agv['id']}/smart-camera/assign",
        headers=superuser_token_headers,
        json={"camera_id": first["id"]},
    )
    replaced = client.post(
        f"{FLEET}/{agv['id']}/smart-camera/replace",
        headers=superuser_token_headers,
        json={"camera_id": second["id"]},
    )
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["smart_camera"]["code"] == second["code"]

    db.expire_all()
    assert active_assignment_for_camera(db, uuid.UUID(first["id"])) is None
    host_asg = active_assignment_for_host(db, uuid.UUID(agv["id"]))
    assert host_asg is not None
    assert host_asg.camera_device_id == uuid.UUID(second["id"])
    assert list(
        db.exec(
            select(AuditLog.action).where(AuditLog.action == "SMART_CAMERA_REPLACED")
        ).all()
    )

    available = client.get(
        f"{FLEET}/smart-cameras/available", headers=superuser_token_headers
    )
    assert available.status_code == 200
    free_codes = {row["code"] for row in available.json()["data"]}
    assert first["code"] in free_codes
    assert second["code"] not in free_codes

    unassigned = client.post(
        f"{FLEET}/{agv['id']}/smart-camera/unassign",
        headers=superuser_token_headers,
    )
    assert unassigned.status_code == 200
    assert unassigned.json()["smart_camera"] is None

    db.expire_all()
    assert active_assignment_for_host(db, uuid.UUID(agv["id"])) is None
    assert active_assignment_for_camera(db, uuid.UUID(second["id"])) is None
    cam_row = db.get(SimDevice, uuid.UUID(second["id"]))
    assert cam_row is not None
    assert cam_row.archived is False

    history = list(
        db.exec(
            select(SimSmartCameraAssignment).where(
                SimSmartCameraAssignment.host_device_id == uuid.UUID(agv["id"])
            )
        ).all()
    )
    assert history
    assert all(row.unassigned_at is not None for row in history)
    assert list(
        db.exec(
            select(AuditLog.action).where(AuditLog.action == "SMART_CAMERA_UNASSIGNED")
        ).all()
    )

    runtime = get_runtime().world["deviceById"].get("agv-2")
    assert runtime is not None
    cam = runtime.get("camera") or {}
    assert not cam.get("installed")


def test_smart_camera_rbac(client: TestClient, db: Session) -> None:
    viewer = _headers_for_role(client, db, ROLE_VIEWER)
    manager = _headers_for_role(client, db, ROLE_MANAGER)
    agv = _find(client, viewer, "agv-2")

    listed = client.get(f"{FLEET}/smart-cameras/available", headers=viewer)
    assert listed.status_code == 200

    cams = client.get(f"{FLEET}?category=smart_cameras", headers=viewer).json()["data"]
    free_cam = next((c for c in cams if not c.get("mounted_on")), None)
    assert free_cam is not None
    denied = client.post(
        f"{FLEET}/{agv['id']}/smart-camera/assign",
        headers=viewer,
        json={"camera_id": free_cam["id"]},
    )
    assert denied.status_code == 403
    denied_mgr = client.post(
        f"{FLEET}/{agv['id']}/smart-camera/assign",
        headers=manager,
        json={"camera_id": free_cam["id"]},
    )
    assert denied_mgr.status_code == 403


def test_category_smart_cameras(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    listed = client.get(
        f"{FLEET}?category=smart_cameras", headers=superuser_token_headers
    )
    assert listed.status_code == 200
    assert listed.json()["count"] >= 2
    assert all(row["kind"] == "smart_camera" for row in listed.json()["data"])
    cats = {c["id"] for c in listed.json()["categories"]}
    assert "smart_cameras" in cats
