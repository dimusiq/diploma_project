"""Тесты назначения браслетов-радиомаяков сотрудникам."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import AuditLog, WarehouseEmployee
from app.warehouse_sim.bracelets import (
    KIND_RADIO_BEACON,
    active_assignment_for_employee,
    ensure_demo_bracelets,
)
from app.warehouse_sim.fleet import demo_warehouse
from app.warehouse_sim.models import DEVICE_RADIO_BEACON, SimBraceletAssignment, SimDevice
from app.warehouse_sim.runtime import get_runtime

PERSONNEL = f"{settings.API_V1_STR}/personnel"
FLEET = f"{settings.API_V1_STR}/warehouse-sim/fleet"


def _create_bracelet(
    client: TestClient,
    headers: dict[str, str],
    *,
    code: str | None = None,
) -> dict:
    suffix = uuid.uuid4().hex[:6]
    body = {
        "kind": KIND_RADIO_BEACON,
        "name": f"RB-T{suffix}",
        "code": code or f"rb-t{suffix}",
        "battery": 77,
        "configuration": {"serialNumber": f"SN-T{suffix}"},
    }
    response = client.post(FLEET, headers=headers, json=body)
    assert response.status_code == 200, response.text
    return response.json()


def _create_employee(
    client: TestClient, headers: dict[str, str], *, code: str | None = None
) -> dict:
    suffix = uuid.uuid4().hex[:6].upper()
    body = {
        "employee_code": code or f"EMP-T{suffix}",
        "first_name": "Тест",
        "last_name": "Браслетов",
        "position": "Кладовщик",
        "department": "Склад №1",
        "status": "working",
        "shift": "day",
    }
    response = client.post(f"{PERSONNEL}/", headers=headers, json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_create_bracelet_as_equipment(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    device = _create_bracelet(client, superuser_token_headers)
    assert device["kind"] == KIND_RADIO_BEACON
    assert device["category"] == "personnel_bracelets"
    assert device["device_type"] == DEVICE_RADIO_BEACON
    assert device["assigned_employee"] is None

    listed = client.get(f"{FLEET}?category=personnel_bracelets", headers=superuser_token_headers)
    assert listed.status_code == 200
    codes = {row["code"] for row in listed.json()["data"]}
    assert device["code"] in codes


def test_assign_and_read_from_both_sides(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    employee = _create_employee(client, superuser_token_headers)
    device = _create_bracelet(client, superuser_token_headers)

    assigned = client.post(
        f"{PERSONNEL}/{employee['id']}/bracelet/assign",
        headers=superuser_token_headers,
        json={"device_id": device["id"]},
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["bracelet"]["code"] == device["code"]

    card = client.get(f"{PERSONNEL}/{employee['id']}", headers=superuser_token_headers)
    assert card.status_code == 200
    assert card.json()["bracelet"]["device_id"] == device["id"]

    fleet_card = client.get(f"{FLEET}/{device['id']}", headers=superuser_token_headers)
    assert fleet_card.status_code == 200
    assert fleet_card.json()["assigned_employee"]["id"] == employee["id"]

    db.expire_all()
    actions = set(
        db.exec(select(AuditLog.action).where(AuditLog.resource_id == uuid.UUID(employee["id"]))).all()
    )
    assert "bracelet.assign" in actions


def test_forbid_double_assign(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    first = _create_employee(client, superuser_token_headers)
    second = _create_employee(client, superuser_token_headers)
    device = _create_bracelet(client, superuser_token_headers)

    ok = client.post(
        f"{PERSONNEL}/{first['id']}/bracelet/assign",
        headers=superuser_token_headers,
        json={"device_id": device["id"]},
    )
    assert ok.status_code == 200

    conflict = client.post(
        f"{PERSONNEL}/{second['id']}/bracelet/assign",
        headers=superuser_token_headers,
        json={"device_id": device["id"]},
    )
    assert conflict.status_code == 409

    other = _create_bracelet(client, superuser_token_headers)
    second_bracelet = client.post(
        f"{PERSONNEL}/{first['id']}/bracelet/assign",
        headers=superuser_token_headers,
        json={"device_id": other["id"]},
    )
    assert second_bracelet.status_code == 409


def test_unassign_frees_device_for_reuse(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    employee = _create_employee(client, superuser_token_headers)
    other = _create_employee(client, superuser_token_headers)
    device = _create_bracelet(client, superuser_token_headers)

    client.post(
        f"{PERSONNEL}/{employee['id']}/bracelet/assign",
        headers=superuser_token_headers,
        json={"device_id": device["id"]},
    )
    freed = client.post(
        f"{PERSONNEL}/{employee['id']}/bracelet/unassign",
        headers=superuser_token_headers,
    )
    assert freed.status_code == 200
    assert freed.json()["bracelet"] is None

    reused = client.post(
        f"{PERSONNEL}/{other['id']}/bracelet/assign",
        headers=superuser_token_headers,
        json={"device_id": device["id"]},
    )
    assert reused.status_code == 200


def test_replace_is_atomic(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    employee = _create_employee(client, superuser_token_headers)
    old = _create_bracelet(client, superuser_token_headers)
    new = _create_bracelet(client, superuser_token_headers)

    client.post(
        f"{PERSONNEL}/{employee['id']}/bracelet/assign",
        headers=superuser_token_headers,
        json={"device_id": old["id"]},
    )
    replaced = client.post(
        f"{PERSONNEL}/{employee['id']}/bracelet/replace",
        headers=superuser_token_headers,
        json={"device_id": new["id"]},
    )
    assert replaced.status_code == 200
    assert replaced.json()["bracelet"]["device_id"] == new["id"]

    db.expire_all()
    active = active_assignment_for_employee(db, uuid.UUID(employee["id"]))
    assert active is not None
    assert str(active.device_id) == new["id"]
    assert str(active.previous_device_id) == old["id"]

    history = client.get(
        f"{PERSONNEL}/{employee['id']}/bracelet/history",
        headers=superuser_token_headers,
    )
    assert history.status_code == 200
    assert history.json()["count"] >= 2


def test_archived_bracelet_cannot_be_assigned(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    employee = _create_employee(client, superuser_token_headers)
    device = _create_bracelet(client, superuser_token_headers)
    archived = client.delete(f"{FLEET}/{device['id']}", headers=superuser_token_headers)
    assert archived.status_code == 200

    denied = client.post(
        f"{PERSONNEL}/{employee['id']}/bracelet/assign",
        headers=superuser_token_headers,
        json={"device_id": device["id"]},
    )
    assert denied.status_code == 409


def test_runtime_mirrors_worker_position(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    warehouse = demo_warehouse(db)
    assert warehouse is not None
    ensure_demo_bracelets(db, warehouse.id)
    db.commit()

    employee = db.get(WarehouseEmployee, uuid.UUID("11111111-1111-4111-8111-111111111001"))
    assert employee is not None
    assignment = active_assignment_for_employee(db, employee.id)
    assert assignment is not None
    device = db.get(SimDevice, assignment.device_id)
    assert device is not None

    rt = get_runtime()
    rt.reset_demo()
    worker = next(
        (w for w in rt.world["workers"] if w.get("employeeCode") == "EMP-001"),
        None,
    )
    assert worker is not None and worker.get("pos")
    beacon = rt.world["deviceById"].get(device.code)
    assert beacon is not None
    assert beacon["kind"] == KIND_RADIO_BEACON
    assert beacon["pos"]["x"] == worker["pos"]["x"]
    assert beacon["pos"]["z"] == worker["pos"]["z"]
    assert beacon.get("locationSource") == "simulation"
    assert beacon.get("locationStale") is False

    # Потеря связи: сотрудник без позиции — координаты браслета сохраняются.
    last = dict(beacon["pos"])
    worker["pos"] = None
    worker["spawned"] = False
    from app.warehouse_sim.bracelets import apply_bracelet_positions

    apply_bracelet_positions(rt.world)
    assert beacon["pos"] == last
    assert beacon.get("locationStale") is True


def test_available_bracelets_exclude_busy(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    employee = _create_employee(client, superuser_token_headers)
    free = _create_bracelet(client, superuser_token_headers)
    busy = _create_bracelet(client, superuser_token_headers)
    client.post(
        f"{PERSONNEL}/{employee['id']}/bracelet/assign",
        headers=superuser_token_headers,
        json={"device_id": busy["id"]},
    )
    available = client.get(f"{PERSONNEL}/bracelets/available", headers=superuser_token_headers)
    assert available.status_code == 200
    ids = {row["device_id"] for row in available.json()["data"]}
    assert free["id"] in ids
    assert busy["id"] not in ids


def test_assignment_persists_across_reads(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    employee = _create_employee(client, superuser_token_headers)
    device = _create_bracelet(client, superuser_token_headers)
    assigned = client.post(
        f"{PERSONNEL}/{employee['id']}/bracelet/assign",
        headers=superuser_token_headers,
        json={"device_id": device["id"]},
    )
    assert assigned.status_code == 200

    db.expire_all()
    again = client.get(f"{PERSONNEL}/{employee['id']}", headers=superuser_token_headers)
    assert again.status_code == 200
    assert again.json()["bracelet"]["device_id"] == device["id"]

    fleet = client.get(f"{FLEET}/{device['id']}", headers=superuser_token_headers)
    assert fleet.status_code == 200
    assert fleet.json()["assigned_employee"]["id"] == employee["id"]

    worker_without = _create_employee(client, superuser_token_headers)
    empty = client.get(f"{PERSONNEL}/{worker_without['id']}", headers=superuser_token_headers)
    assert empty.status_code == 200
    assert empty.json()["bracelet"] is None
