from fastapi.testclient import TestClient

from app.core.config import settings


def test_normal_user_forbidden(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/warehouse-sim/snapshot",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 403


def test_unauthenticated_rejected(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/warehouse-sim/snapshot")
    assert r.status_code in (401, 403)


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
