from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import ROLE_VIEWER
from app.tests.api.routes.test_warehouse_sim import _headers_for_role


def test_viewer_reads_camera_but_cannot_control(
    client: TestClient, db: Session
) -> None:
    headers = _headers_for_role(client, db, ROLE_VIEWER)
    status = client.get(
        f"{settings.API_V1_STR}/warehouse-sim/equipment/agv-1/camera/status",
        headers=headers,
    )
    assert status.status_code == 200
    body = status.json()
    assert body["installed"] is True
    assert body["equipment_id"] == "agv-1"
    denied = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/equipment/agv-1/camera/control",
        headers=headers,
        json={"action": "start"},
    )
    assert denied.status_code == 403


def test_admin_starts_camera_and_reads_detections(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    started = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/equipment/agv-1/camera/control",
        headers=superuser_token_headers,
        json={"action": "start"},
    )
    assert started.status_code == 200
    assert started.json()["online"] is True
    assert started.json()["source"] == "scene"
    empty = client.get(
        f"{settings.API_V1_STR}/warehouse-sim/equipment/agv-1/camera/detections",
        headers=superuser_token_headers,
    )
    assert empty.status_code == 200
    assert empty.json()["count"] == 0
    seen = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/equipment/agv-1/camera/control",
        headers=superuser_token_headers,
        json={"action": "seen", "class_name": "person", "entity_id": "wrk-1"},
    )
    assert seen.status_code == 200
    assert seen.json()["obstacle"] is True
    detections = client.get(
        f"{settings.API_V1_STR}/warehouse-sim/equipment/agv-1/camera/detections",
        headers=superuser_token_headers,
    )
    assert detections.status_code == 200
    payload = detections.json()
    assert payload["count"] == 1
    assert payload["data"][0]["class_name"] == "person"
    assert payload["data"][0]["track_id"] == "wrk-1"
    assert payload["data"][0]["bbox"] is None
    frame = client.get(
        f"{settings.API_V1_STR}/warehouse-sim/equipment/agv-1/camera/frame",
        headers=superuser_token_headers,
    )
    assert frame.status_code == 200
    assert frame.json()["mode"] == "scene"
    assert frame.json()["svg"] is None
    missing = client.get(
        f"{settings.API_V1_STR}/warehouse-sim/equipment/agv-2/camera",
        headers=superuser_token_headers,
    )
    assert missing.status_code == 200
    assert missing.json()["installed"] is False
    client.post(
        f"{settings.API_V1_STR}/warehouse-sim/equipment/agv-1/camera/control",
        headers=superuser_token_headers,
        json={"action": "stop"},
    )
