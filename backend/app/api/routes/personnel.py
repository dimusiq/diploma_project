"""Справочник сотрудников склада. Runtime-позиция приходит из симуляции."""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from sqlmodel import col, or_, select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.audit import get_client_ip, log_audit
from app.core.permissions import PERM_PERSONNEL_READ, PERM_PERSONNEL_WRITE
from app.models import (
    Message,
    PersonnelActivity,
    PersonnelCreate,
    PersonnelList,
    PersonnelPublic,
    PersonnelUpdate,
    WarehouseEmployee,
)

router = APIRouter(prefix="/personnel", tags=["personnel"])


def _runtime_workers() -> list[dict]:
    from app.warehouse_sim.runtime import get_runtime

    try:
        world = get_runtime().world
    except Exception:
        return []
    return list(world.get("workers") or [])


def _match_worker(employee: WarehouseEmployee, workers: list[dict]) -> dict | None:
    employee_id = str(employee.id)
    for worker in workers:
        if worker.get("employeeCode") == employee.employee_code:
            return worker
        if str(worker.get("workerId") or "") == employee_id:
            return worker
    return None


def _present(worker: dict | None) -> bool:
    return bool(worker and worker.get("spawned", True) and worker.get("pos"))


def _public(employee: WarehouseEmployee, worker: dict | None) -> PersonnelPublic:
    present = _present(worker)
    return PersonnelPublic(
        id=employee.id,
        employee_code=employee.employee_code,
        first_name=employee.first_name,
        last_name=employee.last_name,
        middle_name=employee.middle_name,
        position=employee.position,
        department=employee.department,
        phone=employee.phone,
        email=employee.email,
        status=employee.status,
        shift=employee.shift,
        hire_date=employee.hire_date,
        notes=employee.notes,
        created_at=employee.created_at,
        updated_at=employee.updated_at,
        current_zone=worker.get("current_zone") if present else None,
        motion_status=worker.get("status") if present else None,
        person_code=worker.get("code") if present else None,
        speed=float(worker.get("speed") or 0.0) if present and worker.get("status") == "walking" else None,
    )


def _get_or_404(session: SessionDep, employee_id: uuid.UUID) -> WarehouseEmployee:
    employee = session.get(WarehouseEmployee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return employee


@router.get(
    "/",
    response_model=PersonnelList,
    dependencies=[require_permission(PERM_PERSONNEL_READ)],
)
def read_personnel(
    session: SessionDep,
    _current_user: CurrentUser,
    q: str | None = Query(default=None),
    status: str | None = Query(default=None),
    position: str | None = Query(default=None),
    shift: str | None = Query(default=None),
) -> Any:
    stmt = select(WarehouseEmployee)
    if status:
        stmt = stmt.where(WarehouseEmployee.status == status)
    if position:
        stmt = stmt.where(WarehouseEmployee.position == position)
    if shift:
        stmt = stmt.where(WarehouseEmployee.shift == shift)
    if q and q.strip():
        needle = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                col(WarehouseEmployee.employee_code).ilike(needle),
                col(WarehouseEmployee.first_name).ilike(needle),
                col(WarehouseEmployee.last_name).ilike(needle),
                col(WarehouseEmployee.middle_name).ilike(needle),
                col(WarehouseEmployee.department).ilike(needle),
                col(WarehouseEmployee.position).ilike(needle),
            )
        )
    rows = list(session.exec(stmt.order_by(WarehouseEmployee.last_name, WarehouseEmployee.first_name)).all())
    workers = _runtime_workers()
    data = [_public(row, _match_worker(row, workers)) for row in rows]
    return PersonnelList(data=data, count=len(data))


@router.get(
    "/{employee_id}",
    response_model=PersonnelPublic,
    dependencies=[require_permission(PERM_PERSONNEL_READ)],
)
def read_employee(session: SessionDep, _current_user: CurrentUser, employee_id: uuid.UUID) -> Any:
    employee = _get_or_404(session, employee_id)
    worker = _match_worker(employee, _runtime_workers())
    return _public(employee, worker)


@router.get(
    "/{employee_id}/activity",
    response_model=PersonnelActivity,
    dependencies=[require_permission(PERM_PERSONNEL_READ)],
)
def read_activity(session: SessionDep, _current_user: CurrentUser, employee_id: uuid.UUID) -> Any:
    employee = _get_or_404(session, employee_id)
    worker = _match_worker(employee, _runtime_workers())
    present = _present(worker)
    return PersonnelActivity(
        present=present,
        on_shift=present and employee.status == "active",
        person_code=worker.get("code") if present else None,
        runtime_id=worker.get("id") if present else None,
        zone=worker.get("current_zone") if present else None,
        motion_status=worker.get("status") if present else None,
        speed=float(worker.get("speed") or 0.0) if present and worker.get("status") == "walking" else None,
        target=worker.get("target") if present else None,
        task_id=worker.get("taskId") if present else None,
    )


@router.post(
    "/",
    response_model=PersonnelPublic,
    dependencies=[require_permission(PERM_PERSONNEL_WRITE)],
)
def create_employee(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    body: PersonnelCreate,
) -> Any:
    existing = session.exec(
        select(WarehouseEmployee).where(WarehouseEmployee.employee_code == body.employee_code)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Табельный номер уже занят")
    employee = WarehouseEmployee.model_validate(body)
    session.add(employee)
    session.commit()
    session.refresh(employee)
    log_audit(
        session,
        user_id=current_user.id,
        action="worker.create",
        resource_type="worker",
        resource_id=employee.id,
        details=employee.employee_code,
        ip_address=get_client_ip(request),
    )
    session.commit()
    return _public(employee, None)


@router.patch(
    "/{employee_id}",
    response_model=PersonnelPublic,
    dependencies=[require_permission(PERM_PERSONNEL_WRITE)],
)
def update_employee(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    employee_id: uuid.UUID,
    body: PersonnelUpdate,
) -> Any:
    employee = _get_or_404(session, employee_id)
    changes = body.model_dump(exclude_unset=True)
    if "employee_code" in changes and changes["employee_code"] != employee.employee_code:
        taken = session.exec(
            select(WarehouseEmployee).where(WarehouseEmployee.employee_code == changes["employee_code"])
        ).first()
        if taken:
            raise HTTPException(status_code=409, detail="Табельный номер уже занят")
    previous = employee.status
    employee.sqlmodel_update(changes)
    from datetime import datetime, timezone

    employee.updated_at = datetime.now(timezone.utc)
    session.add(employee)
    session.commit()
    session.refresh(employee)
    deactivated = employee.status in ("inactive", "terminated") and employee.status != previous
    log_audit(
        session,
        user_id=current_user.id,
        action="worker.deactivate" if deactivated else "worker.update",
        resource_type="worker",
        resource_id=employee.id,
        details=employee.employee_code,
        ip_address=get_client_ip(request),
    )
    session.commit()
    return _public(employee, _match_worker(employee, _runtime_workers()))


@router.delete(
    "/{employee_id}",
    response_model=Message,
    dependencies=[require_permission(PERM_PERSONNEL_WRITE)],
)
def deactivate_employee(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    employee_id: uuid.UUID,
) -> Any:
    employee = _get_or_404(session, employee_id)
    if employee.status not in ("inactive", "terminated"):
        employee.status = "inactive"
        from datetime import datetime, timezone

        employee.updated_at = datetime.now(timezone.utc)
        session.add(employee)
        session.commit()
    log_audit(
        session,
        user_id=current_user.id,
        action="worker.deactivate",
        resource_type="worker",
        resource_id=employee.id,
        details=employee.employee_code,
        ip_address=get_client_ip(request),
    )
    session.commit()
    return Message(message="Сотрудник деактивирован")
