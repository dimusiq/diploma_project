from typing import Any
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

PREFIX = f"{settings.API_V1_STR}/personnel"


def _payload(code: str, **extra: Any) -> dict[str, Any]:
    body = {
        "employee_code": code,
        "first_name": "Мария",
        "last_name": "Кузнецова",
        "middle_name": "Олеговна",
        "position": "Кладовщик",
        "department": "Склад №1",
        "phone": "+79000000000",
        "email": "maria@example.com",
        "status": "working",
        "shift": "day",
        "notes": "тест",
    }
    body.update(extra)
    return body


def test_personnel_crud_and_delete(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    code = f"EMP-T{uuid.uuid4().hex[:6].upper()}"
    created = client.post(
        f"{PREFIX}/", headers=superuser_token_headers, json=_payload(code)
    )
    assert created.status_code == 200, created.text
    employee_id = created.json()["id"]
    assert created.json()["employee_code"] == code
    assert created.json()["status"] == "working"
    assert created.json()["status_until"] is None

    listed = client.get(
        f"{PREFIX}/", headers=superuser_token_headers, params={"q": code}
    )
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
    assert still.status_code == 404

    db.expire_all()
    actions = set(
        db.exec(
            select(AuditLog.action).where(
                AuditLog.resource_id == uuid.UUID(employee_id)
            )
        ).all()
    )
    assert "worker.create" in actions
    assert "worker.update" in actions
    assert "worker.delete" in actions
    assert db.get(WarehouseEmployee, uuid.UUID(employee_id)) is None


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
    created = client.post(
        f"{PREFIX}/", headers=manager, json=_payload(code, email=None)
    )
    assert created.status_code == 200, created.text


def test_personnel_status_rules(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    headers = superuser_token_headers

    def create(status: str, **extra: Any) -> tuple[Any, str]:
        code = f"EMP-S{uuid.uuid4().hex[:6].upper()}"
        body = _payload(code, status=status, **extra)
        return client.post(f"{PREFIX}/", headers=headers, json=body), code

    working, _code = create("working", status_until="2026-10-01")
    assert working.status_code == 200, working.text
    assert working.json()["status"] == "working"
    assert working.json()["status_until"] is None

    sick, _code = create("sick", status_until="2026-09-25")
    assert sick.status_code == 200, sick.text
    assert sick.json()["status"] == "sick"
    assert sick.json()["status_until"] == "2026-09-25"

    vacation, vacation_code = create("vacation", status_until="2026-10-10")
    assert vacation.status_code == 200, vacation.text
    assert vacation.json()["status"] == "vacation"
    assert vacation.json()["status_until"] == "2026-10-10"

    paused, _code = create("break", status_until="2026-10-01")
    assert paused.status_code == 200, paused.text
    assert paused.json()["status"] == "break"
    assert paused.json()["status_until"] is None

    missing_sick, _code = create("sick")
    assert missing_sick.status_code == 422

    missing_vacation, _code = create("vacation")
    assert missing_vacation.status_code == 422

    inactive, _code = create("inactive")
    assert inactive.status_code == 422

    employee_id = vacation.json()["id"]
    edited = client.patch(
        f"{PREFIX}/{employee_id}",
        headers=headers,
        json={"status": "sick", "status_until": "2026-11-01"},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["status"] == "sick"
    assert edited.json()["status_until"] == "2026-11-01"

    cleared = client.patch(
        f"{PREFIX}/{employee_id}",
        headers=headers,
        json={"status": "working", "status_until": "2026-12-01"},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["status"] == "working"
    assert cleared.json()["status_until"] is None

    listed = client.get(
        f"{PREFIX}/", headers=headers, params={"q": vacation_code, "status": "working"}
    )
    assert listed.status_code == 200
    assert listed.json()["count"] == 1

    rejected = client.get(f"{PREFIX}/", headers=headers, params={"status": "inactive"})
    assert rejected.status_code == 422
