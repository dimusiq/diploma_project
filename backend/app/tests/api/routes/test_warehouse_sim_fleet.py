from uuid import uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import ROLE_ADMIN, ROLE_VIEWER
from app.tests.api.routes.test_warehouse_sim import _headers_for_role
from app.warehouse_sim.fleet import baseline_devices
from app.warehouse_sim.runtime import get_runtime


def _fleet_url() -> str:
    return f"{settings.API_V1_STR}/warehouse-sim/fleet"


def test_get_fleet_returns_baseline_park(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(_fleet_url(), headers=superuser_token_headers)
    assert r.status_code == 200
    body = r.json()
    codes = {row["code"] for row in body["data"]}
    expected = {d["id"] for d in baseline_devices()}
    assert expected <= codes
    assert body["count"] >= len(expected)
    assert {row["kind"] for row in body["data"] if row["code"] in expected} <= {
        "agv",
        "amr",
        "forklift",
        "scanner",
        "sensor",
        "conveyor",
        "dock_door",
        "charger",
    }
    assert any(row["code"] == "agv-1" and row["category"] == "transport" for row in body["data"])
    assert {cat["id"] for cat in body["categories"]} >= {
        "all",
        "transport",
        "scanner",
        "conveyor",
        "sensor",
        "gate",
        "charging",
        "other",
    }


def test_fleet_filter_by_category(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    transport = client.get(
        f"{_fleet_url()}?category=transport",
        headers=superuser_token_headers,
    )
    assert transport.status_code == 200
    kinds = {row["kind"] for row in transport.json()["data"]}
    assert kinds <= {"agv", "amr", "forklift"}
    assert "agv-1" in {row["code"] for row in transport.json()["data"]}

    sensors = client.get(
        f"{_fleet_url()}?category=sensor",
        headers=superuser_token_headers,
    )
    assert sensors.status_code == 200
    assert all(row["kind"] == "sensor" for row in sensors.json()["data"])
    assert any(row["code"].startswith("sns-") for row in sensors.json()["data"])

    gates = client.get(
        f"{_fleet_url()}?category=gate",
        headers=superuser_token_headers,
    )
    assert gates.status_code == 200
    assert all(row["kind"] == "dock_door" for row in gates.json()["data"])

    by_kind = client.get(
        f"{_fleet_url()}?kind=agv",
        headers=superuser_token_headers,
    )
    assert by_kind.status_code == 200
    assert by_kind.json()["data"]
    assert all(row["kind"] == "agv" for row in by_kind.json()["data"])


def test_admin_creates_patches_and_archives_fleet_device(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    created = client.post(
        _fleet_url(),
        headers=superuser_token_headers,
        json={"kind": "agv", "name": f"AGV Test Fleet {uuid4().hex[:6]}", "code": f"agv-ft-{uuid4().hex[:8]}"},
    )
    assert created.status_code == 200
    row = created.json()
    assert row["code"].startswith("agv-ft-")
    assert row["name"].startswith("AGV Test Fleet")
    code = row["code"]
    device_id = row["id"]

    snap = client.get(
        f"{settings.API_V1_STR}/warehouse-sim/snapshot",
        headers=superuser_token_headers,
    )
    assert any(d["id"] == code for d in snap.json()["devices"])

    patched = client.patch(
        f"{_fleet_url()}/{device_id}",
        headers=superuser_token_headers,
        json={"name": f"AGV Alpha {uuid4().hex[:6]}", "speed": 1.7, "configuration": {"zoneId": "zone-chrg"}},
    )
    assert patched.status_code == 200
    assert patched.json()["name"].startswith("AGV Alpha")
    assert patched.json()["configuration"]["speed"] == 1.7
    assert patched.json()["configuration"]["zoneId"] == "zone-chrg"

    disabled = client.patch(
        f"{_fleet_url()}/{device_id}",
        headers=superuser_token_headers,
        json={"enabled": False},
    )
    assert disabled.status_code == 200
    assert disabled.json()["enabled"] is False

    archived = client.delete(
        f"{_fleet_url()}/{device_id}",
        headers=superuser_token_headers,
    )
    assert archived.status_code == 200
    assert archived.json()["archived"] is True
    listed = client.get(_fleet_url(), headers=superuser_token_headers).json()
    assert all(item["id"] != device_id for item in listed["data"])
    with_arch = client.get(
        f"{_fleet_url()}?include_archived=true",
        headers=superuser_token_headers,
    ).json()
    assert any(item["id"] == device_id for item in with_arch["data"])


def test_viewer_can_read_fleet_but_cannot_change(
    client: TestClient, db: Session
) -> None:
    headers = _headers_for_role(client, db, ROLE_VIEWER)
    listed = client.get(_fleet_url(), headers=headers)
    assert listed.status_code == 200
    created = client.post(
        _fleet_url(),
        headers=headers,
        json={"kind": "agv", "name": "Viewer AGV"},
    )
    assert created.status_code == 403


def test_role_admin_can_change_fleet(client: TestClient, db: Session) -> None:
    headers = _headers_for_role(client, db, ROLE_ADMIN, is_superuser=False)
    created = client.post(
        _fleet_url(),
        headers=headers,
        json={"kind": "forklift", "name": f"FL Admin {uuid4().hex[:6]}", "code": f"fl-adm-{uuid4().hex[:8]}"},
    )
    assert created.status_code == 200
    device_id = created.json()["id"]
    client.delete(f"{_fleet_url()}/{device_id}", headers=headers)


def test_simulation_reset_uses_active_fleet(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    code = f"amr-ft-{uuid4().hex[:8]}"
    created = client.post(
        _fleet_url(),
        headers=superuser_token_headers,
        json={"kind": "amr", "name": f"AMR Fleet Init {code}", "code": code},
    )
    assert created.status_code == 200
    device_id = created.json()["id"]
    reset = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/control",
        headers=superuser_token_headers,
        json={"action": "reset"},
    )
    assert reset.status_code == 200
    ids = {d["id"] for d in reset.json()["devices"]}
    assert code in ids
    assert "agv-1" in ids
    client.delete(f"{_fleet_url()}/{device_id}", headers=superuser_token_headers)
    client.post(
        f"{settings.API_V1_STR}/warehouse-sim/control",
        headers=superuser_token_headers,
        json={"action": "reset"},
    )
    assert get_runtime().world["deviceById"].get(code) is None
