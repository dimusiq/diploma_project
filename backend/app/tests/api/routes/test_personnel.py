import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import ROLE_MANAGER, ROLE_VIEWER, ROLE_WAREHOUSE, AuditLog, WarehouseEmployee
from app.tests.api.routes.test_warehouse_sim import _headers_for_role

PREFIX = f"{settings.API_V1_STR}/personnel"


def _payload(code: str, **extra: object) -> dict:
    body = {
        "employee_code": code,
        "first_name": "Мария",
        "last_name": "Кузнецова",
        "middle_name": "Олеговна",
        "position": "Кладовщик",
        "department": "Склад №1",
        "phone": "+79000000000",
        "email": "maria@example.com",
        "status": "active",
        "shift": "day",
        "notes": "тест",
    }
    body.update(extra)
    return body


def test_personnel_crud_and_deactivate(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    code = f"EMP-T{uuid.uuid4().hex[:6].upper()}"
    created = client.post(f"{PREFIX}/", headers=superuser_token_headers, json=_payload(code))
    assert created.status_code == 200, created.text
    employee_id = created.json()["id"]
    assert created.json()["employee_code"] == code
    assert created.json()["status"] == "active"

    listed = client.get(f"{PREFIX}/", headers=superuser_token_headers, params={"q": code})
    assert listed.status_code == 200
    assert listed.json()["count"] == 1

    patched = client.patch(
        f"{PREFIX}/{employee_id}",
        headers=superuser_token_headers,
        json={"position": "Старший кладовщик", "shift": "night"},
    )
    assert patched.status_code == 200
    assert patched.json()["position"] == "Старший кладовщик"
    assert patched.json()["shift"] == "night"

    removed = client.delete(f"{PREFIX}/{employee_id}", headers=superuser_token_headers)
    assert removed.status_code == 200
    still = client.get(f"{PREFIX}/{employee_id}", headers=superuser_token_headers)
    assert still.status_code == 200
    assert still.json()["status"] == "inactive"

    db.expire_all()
    actions = set(
        db.exec(select(AuditLog.action).where(AuditLog.resource_id == uuid.UUID(employee_id))).all()
    )
    assert "worker.create" in actions
    assert "worker.update" in actions
    assert "worker.deactivate" in actions
    assert db.get(WarehouseEmployee, uuid.UUID(employee_id)) is not None


def test_personnel_rbac(client: TestClient, db: Session) -> None:
    viewer = _headers_for_role(client, db, ROLE_VIEWER)
    warehouse = _headers_for_role(client, db, ROLE_WAREHOUSE)
    manager = _headers_for_role(client, db, ROLE_MANAGER)

    denied = client.get(f"{PREFIX}/", headers=viewer)
    assert denied.status_code == 403

    allowed = client.get(f"{PREFIX}/", headers=warehouse)
    assert allowed.status_code == 200

    blocked = client.post(
        f"{PREFIX}/",
        headers=warehouse,
        json=_payload(f"EMP-W{uuid.uuid4().hex[:6].upper()}"),
    )
    assert blocked.status_code == 403

    code = f"EMP-M{uuid.uuid4().hex[:6].upper()}"
    created = client.post(f"{PREFIX}/", headers=manager, json=_payload(code, email=None))
    assert created.status_code == 200, created.text
