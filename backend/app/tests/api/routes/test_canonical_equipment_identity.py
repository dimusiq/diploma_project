"""Canonical equipment is wsim_device; TO/work orders share the same id and name."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import settings


def _fleet_url() -> str:
    return f"{settings.API_V1_STR}/warehouse-sim/fleet"


def test_rename_and_status_propagate_to_maintenance_and_work_orders(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    created = client.post(
        _fleet_url(),
        headers=superuser_token_headers,
        json={
            "kind": "agv",
            "name": f"AGV-01 {uuid4().hex[:6]}",
            "code": f"agv-id-{uuid4().hex[:8]}",
        },
    )
    assert created.status_code == 200
    device = created.json()
    device_id = device["id"]
    original_name = device["name"]

    listed = client.get(_fleet_url(), headers=superuser_token_headers)
    assert listed.status_code == 200
    match = next(row for row in listed.json()["data"] if row["id"] == device_id)
    assert match["name"] == original_name

    new_name = "AGV Погрузчик №1"
    new_code = f"sn-{uuid4().hex[:8]}"
    patched = client.patch(
        f"{_fleet_url()}/{device_id}",
        headers=superuser_token_headers,
        json={
            "name": new_name,
            "code": new_code,
            "engineHours": 420,
            "inMaintenance": True,
            "configuration": {"zoneId": "zone-chrg"},
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["id"] == device_id
    assert body["name"] == new_name
    assert body["code"] == new_code
    assert body["engine_hours"] == 420
    assert body["inMaintenance"] is True
    assert body["configuration"]["zoneId"] == "zone-chrg"

    listed_after = client.get(_fleet_url(), headers=superuser_token_headers)
    assert listed_after.status_code == 200
    again = next(row for row in listed_after.json()["data"] if row["id"] == device_id)
    assert again["name"] == new_name
    assert again["code"] == new_code
    assert again["engine_hours"] == 420
    assert again["inMaintenance"] is True

    calendar = client.get(
        f"{settings.API_V1_STR}/maintenance-calendar-events/?limit=500",
        headers=superuser_token_headers,
    )
    assert calendar.status_code == 200
    cal_row = next(
        row for row in calendar.json()["data"] if row["equipment_id"] == device_id
    )
    assert cal_row["equipment_name"] == new_name
    assert cal_row["engine_hours"] == 420

    created_mr = client.post(
        f"{settings.API_V1_STR}/equipment/{device_id}/maintenance-records",
        headers=superuser_token_headers,
        json={
            "performed_at": "2026-09-20",
            "interval_hours": 500,
            "engine_hours_at_service": 400,
            "comment": "identity-test",
        },
    )
    assert created_mr.status_code == 200
    assert created_mr.json()["equipment_id"] == device_id

    by_device = client.get(
        f"{settings.API_V1_STR}/equipment/{device_id}/maintenance-records",
        headers=superuser_token_headers,
    )
    assert by_device.status_code == 200
    assert any(row["id"] == created_mr.json()["id"] for row in by_device.json()["data"])

    all_mr = client.get(
        f"{settings.API_V1_STR}/equipment/maintenance-records?limit=500",
        headers=superuser_token_headers,
    )
    assert all_mr.status_code == 200
    listed_mr = next(row for row in all_mr.json()["data"] if row["id"] == created_mr.json()["id"])
    assert listed_mr["equipment_id"] == device_id
    assert listed_mr["equipment_name"] == new_name

    wo = client.post(
        f"{settings.API_V1_STR}/work-orders",
        headers=superuser_token_headers,
        json={"equipment_id": device_id, "title": "Наряд identity", "priority": "medium"},
    )
    assert wo.status_code == 200
    assert wo.json()["equipment_id"] == device_id
    assert wo.json()["equipment_name"] == new_name
