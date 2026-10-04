"""Массовые операции персонала: перемещение и удаление."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import (
    ROLE_MANAGER,
    ROLE_VIEWER,
    ROLE_WAREHOUSE,
    AuditLog,
    WarehouseEmployee,
)
from app.tests.api.routes.test_warehouse_sim import _headers_for_role
from app.warehouse_sim.bracelets import KIND_RADIO_BEACON, active_assignment_for_device
from app.warehouse_sim.models import SimBraceletAssignment

PREFIX = f"{settings.API_V1_STR}/personnel"
FLEET = f"{settings.API_V1_STR}/warehouse-sim/fleet"


def _payload(code: str, **extra: object) -> dict:
    body = {
        "employee_code": code,
        "first_name": "Мария",
        "last_name": "Кузнецова",
        "position": "Кладовщик",
        "department": "Склад №1",
        "status": "working",
        "shift": "day",
    }
    body.update(extra)
    return body


def _create(client: TestClient, headers: dict[str, str], **extra: object) -> dict:
    code = f"EMP-B{uuid.uuid4().hex[:6].upper()}"
    response = client.post(f"{PREFIX}/", headers=headers, json=_payload(code, **extra))
    assert response.status_code == 200, response.text
    return response.json()


def test_bulk_department_move(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    a = _create(client, superuser_token_headers)
    b = _create(client, superuser_token_headers)
    c = _create(client, superuser_token_headers, department="Склад №3")
    moved = client.post(
        f"{PREFIX}/bulk/department",
        headers=superuser_token_headers,
        json={"worker_ids": [a["id"], b["id"], c["id"]], "department": "Склад №2"},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["updated"] == 3
    assert moved.json()["department"] == "Склад №2"
    assert "Склад №2" in moved.json()["message"]

    db.expire_all()
    for row_id in (a["id"], b["id"], c["id"]):
        assert db.get(WarehouseEmployee, uuid.UUID(row_id)).department == "Склад №2"

    actions = list(
        db.exec(
            select(AuditLog.action).where(
                AuditLog.action == "PERSONNEL_BULK_DEPARTMENT_CHANGE"
            )
        ).all()
    )
    assert actions


def test_bulk_delete_frees_bracelets_and_keeps_history(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    a = _create(client, superuser_token_headers)
    b = _create(client, superuser_token_headers)
    c = _create(client, superuser_token_headers)
    bracelet = client.post(
        FLEET,
        headers=superuser_token_headers,
        json={
            "kind": KIND_RADIO_BEACON,
            "name": f"RB-B{uuid.uuid4().hex[:4]}",
            "code": f"rb-b{uuid.uuid4().hex[:6]}",
            "battery": 70,
        },
    )
    assert bracelet.status_code == 200, bracelet.text
    device_id = bracelet.json()["id"]
    assigned = client.post(
        f"{PREFIX}/{a['id']}/bracelet/assign",
        headers=superuser_token_headers,
        json={"device_id": device_id},
    )
    assert assigned.status_code == 200, assigned.text

    deleted = client.post(
        f"{PREFIX}/bulk/delete",
        headers=superuser_token_headers,
        json={"worker_ids": [a["id"], b["id"], c["id"]]},
    )
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["deleted"] == 3

    db.expire_all()
    assert db.get(WarehouseEmployee, uuid.UUID(a["id"])) is None
    assert db.get(WarehouseEmployee, uuid.UUID(b["id"])) is None
    assert db.get(WarehouseEmployee, uuid.UUID(c["id"])) is None
    assert active_assignment_for_device(db, uuid.UUID(device_id)) is None
    history = list(
        db.exec(
            select(SimBraceletAssignment).where(
                SimBraceletAssignment.device_id == uuid.UUID(device_id)
            )
        ).all()
    )
    assert history
    assert all(row.unassigned_at is not None for row in history)
    # История сохраняется; employee_id может быть NULL после SET NULL / unassign.
    assert any(
        row.employee_id is None or row.unassigned_at is not None for row in history
    )

    fleet = client.get(f"{FLEET}/{device_id}", headers=superuser_token_headers)
    assert fleet.status_code == 200
    assert fleet.json()["assigned_employee"] is None

    audits = list(
        db.exec(
            select(AuditLog.action).where(AuditLog.action == "PERSONNEL_BULK_DELETE")
        ).all()
    )
    assert audits


def test_bulk_delete_is_transactional_on_missing_id(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    worker = _create(client, superuser_token_headers)
    missing = str(uuid.uuid4())
    response = client.post(
        f"{PREFIX}/bulk/delete",
        headers=superuser_token_headers,
        json={"worker_ids": [worker["id"], missing]},
    )
    assert response.status_code == 404
    db.expire_all()
    assert db.get(WarehouseEmployee, uuid.UUID(worker["id"])) is not None


def test_bulk_department_is_transactional_on_missing_id(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    worker = _create(client, superuser_token_headers, department="Склад №1")
    missing = str(uuid.uuid4())
    response = client.post(
        f"{PREFIX}/bulk/department",
        headers=superuser_token_headers,
        json={"worker_ids": [worker["id"], missing], "department": "Склад №2"},
    )
    assert response.status_code == 404
    db.expire_all()
    assert db.get(WarehouseEmployee, uuid.UUID(worker["id"])).department == "Склад №1"


def test_bulk_missing_worker_error(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    missing = str(uuid.uuid4())
    response = client.post(
        f"{PREFIX}/bulk/department",
        headers=superuser_token_headers,
        json={"worker_ids": [missing], "department": "Склад №2"},
    )
    assert response.status_code == 404

    response = client.post(
        f"{PREFIX}/bulk/delete",
        headers=superuser_token_headers,
        json={"worker_ids": [missing]},
    )
    assert response.status_code == 404


def test_bulk_empty_department_rejected(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    worker = _create(client, superuser_token_headers)
    response = client.post(
        f"{PREFIX}/bulk/department",
        headers=superuser_token_headers,
        json={"worker_ids": [worker["id"]], "department": "   "},
    )
    assert response.status_code in (422, 400)


def test_bulk_rbac(client: TestClient, db: Session) -> None:
    viewer = _headers_for_role(client, db, ROLE_VIEWER)
    warehouse = _headers_for_role(client, db, ROLE_WAREHOUSE)
    manager = _headers_for_role(client, db, ROLE_MANAGER)
    worker = _create(client, manager)

    denied_view = client.post(
        f"{PREFIX}/bulk/delete",
        headers=viewer,
        json={"worker_ids": [worker["id"]]},
    )
    assert denied_view.status_code == 403

    denied_wh = client.post(
        f"{PREFIX}/bulk/department",
        headers=warehouse,
        json={"worker_ids": [worker["id"]], "department": "Склад №2"},
    )
    assert denied_wh.status_code == 403

    ok = client.post(
        f"{PREFIX}/bulk/department",
        headers=manager,
        json={"worker_ids": [worker["id"]], "department": "Склад №2"},
    )
    assert ok.status_code == 200, ok.text


def test_departments_list(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    _create(client, superuser_token_headers, department="Склад №7")
    response = client.get(f"{PREFIX}/departments", headers=superuser_token_headers)
    assert response.status_code == 200
    names = response.json()["data"]
    assert "Склад №1" in names
    assert "Склад №7" in names
