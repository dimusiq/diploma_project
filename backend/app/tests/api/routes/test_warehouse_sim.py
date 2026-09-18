from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import (
    ROLE_ADMIN,
    ROLE_MANAGER,
    ROLE_VIEWER,
    ROLE_WAREHOUSE,
    Role,
    UserCreate,
)
from app.tests.utils.user import user_authentication_headers
from app.tests.utils.utils import random_email, random_lower_string


def _headers_for_role(
    client: TestClient,
    db: Session,
    role_name: str,
    *,
    is_superuser: bool = False,
) -> dict[str, str]:
    role = db.exec(select(Role).where(Role.name == role_name)).first()
    assert role is not None
    email = random_email()
    password = random_lower_string()
    crud.create_user(
        session=db,
        user_create=UserCreate(
            email=email,
            password=password,
            role_id=role.id,
            is_superuser=is_superuser,
        ),
    )
    return user_authentication_headers(client=client, email=email, password=password)


def test_authenticated_user_can_read_snapshot(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/warehouse-sim/snapshot",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 200
    assert r.json()["state"] in ("STOPPED", "RUNNING", "PAUSED")


def test_unauthenticated_rejected(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/warehouse-sim/snapshot")
    assert r.status_code in (401, 403)


def test_manager_can_read_snapshot(client: TestClient, db: Session) -> None:
    headers = _headers_for_role(client, db, ROLE_MANAGER)
    r = client.get(f"{settings.API_V1_STR}/warehouse-sim/snapshot", headers=headers)
    assert r.status_code == 200


def test_warehouse_role_can_read_snapshot(client: TestClient, db: Session) -> None:
    headers = _headers_for_role(client, db, ROLE_WAREHOUSE)
    r = client.get(f"{settings.API_V1_STR}/warehouse-sim/snapshot", headers=headers)
    assert r.status_code == 200


def test_viewer_can_read_snapshot(client: TestClient, db: Session) -> None:
    headers = _headers_for_role(client, db, ROLE_VIEWER)
    r = client.get(f"{settings.API_V1_STR}/warehouse-sim/snapshot", headers=headers)
    assert r.status_code == 200


def test_role_admin_allowed_without_superuser(client: TestClient, db: Session) -> None:
    headers = _headers_for_role(client, db, ROLE_ADMIN, is_superuser=False)
    me = client.get(f"{settings.API_V1_STR}/users/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["role_name"] == ROLE_ADMIN
    assert me.json()["is_superuser"] is False
    r = client.get(f"{settings.API_V1_STR}/warehouse-sim/snapshot", headers=headers)
    assert r.status_code == 200
    assert r.json()["state"] in ("STOPPED", "RUNNING", "PAUSED")


def test_superuser_snapshot_and_control(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    snap = client.get(
        f"{settings.API_V1_STR}/warehouse-sim/snapshot",
        headers=superuser_token_headers,
    )
    assert snap.status_code == 200
    body = snap.json()
    assert body["state"] in ("STOPPED", "RUNNING", "PAUSED")
    assert "devices" in body and len(body["devices"]) > 0
    assert "kpi" in body

    started = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/control",
        headers=superuser_token_headers,
        json={"action": "start"},
    )
    assert started.status_code == 200
    assert started.json()["state"] == "RUNNING"

    paused = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/control",
        headers=superuser_token_headers,
        json={"action": "pause"},
    )
    assert paused.json()["state"] == "PAUSED"

    ff = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/fast-forward",
        headers=superuser_token_headers,
        json={"seconds": 120},
    )
    assert ff.status_code == 200
    assert ff.json()["timeSec"] >= 120

    device_id = body["devices"][0]["id"]
    cmd = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/devices/{device_id}/command",
        headers=superuser_token_headers,
        json={"command": "FAIL"},
    )
    assert cmd.status_code == 200

    scenario = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/scenarios/apply",
        headers=superuser_token_headers,
        json={"code": "NORMAL_OPERATION"},
    )
    assert scenario.status_code == 200

    stopped = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/control",
        headers=superuser_token_headers,
        json={"action": "reset"},
    )
    assert stopped.status_code == 200
    assert stopped.json()["state"] == "STOPPED"


def test_demo_start_forbidden_for_normal_user(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/demo/start",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 403


def test_control_forbidden_for_normal_user(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/control",
        headers=normal_user_token_headers,
        json={"action": "start"},
    )
    assert r.status_code == 403


def test_superuser_demo_start_and_reset(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    started = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/demo/start",
        headers=superuser_token_headers,
    )
    assert started.status_code == 200
    body = started.json()
    assert body["state"] == "RUNNING"
    assert body["speed"] == 10
    assert len(body.get("trucks") or body.get("inbound") or [1]) >= 1

    reset = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/demo/reset",
        headers=superuser_token_headers,
    )
    assert reset.status_code == 200
    assert reset.json()["state"] == "STOPPED"


def test_events_persist_and_filter(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    started = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/control",
        headers=superuser_token_headers,
        json={"action": "start"},
    )
    assert started.status_code == 200
    r = client.get(
        f"{settings.API_V1_STR}/warehouse-sim/events",
        headers=superuser_token_headers,
        params={"event_type": "SYSTEM_STARTED", "limit": 20, "skip": 0},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 1
    assert any(event["type"] == "SYSTEM_STARTED" for event in body["data"])
    search = client.get(
        f"{settings.API_V1_STR}/warehouse-sim/events",
        headers=superuser_token_headers,
        params={"q": "Симуляция", "limit": 50},
    )
    assert search.status_code == 200
    assert search.json()["count"] >= 1
    client.post(
        f"{settings.API_V1_STR}/warehouse-sim/control",
        headers=superuser_token_headers,
        json={"action": "reset"},
    )
