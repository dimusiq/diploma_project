"""Справочник сотрудников склада. Runtime-позиция приходит из симуляции."""

import uuid
from typing import Any, TypeGuard

from fastapi import APIRouter, HTTPException, Query, Request
from sqlmodel import col, or_, select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.audit import get_client_ip, log_audit
from app.core.permissions import PERM_PERSONNEL_READ, PERM_PERSONNEL_WRITE
from app.models import (
    EMPLOYEE_DATED_STATUSES,
    EMPLOYEE_STATUSES,
    Message,
    PersonnelActivity,
    PersonnelBraceletAssign,
    PersonnelBraceletHistoryItem,
    PersonnelBraceletHistoryList,
    PersonnelBraceletInfo,
    PersonnelBulkDepartment,
    PersonnelBulkIds,
    PersonnelBulkResult,
    PersonnelCreate,
    PersonnelDepartmentList,
    PersonnelList,
    PersonnelPublic,
    PersonnelUpdate,
    WarehouseEmployee,
)

router = APIRouter(prefix="/personnel", tags=["personnel"])


def _runtime_workers() -> list[dict[str, Any]]:
    from app.warehouse_sim.runtime import get_runtime

    try:
        return get_runtime().view_workers()
    except Exception:
        return []


def _runtime_device(code: str | None) -> dict[str, Any] | None:
    if not code:
        return None
    from app.warehouse_sim.runtime import get_runtime

    try:
        return get_runtime().view_device(code)
    except Exception:
        return None


def _match_worker(
    employee: WarehouseEmployee, workers: list[dict[str, Any]]
) -> dict[str, Any] | None:
    employee_id = str(employee.id)
    for worker in workers:
        if worker.get("employeeCode") == employee.employee_code:
            return worker
        if str(worker.get("workerId") or "") == employee_id:
            return worker
    return None


def _present(worker: dict[str, Any] | None) -> TypeGuard[dict[str, Any]]:
    return bool(worker and worker.get("spawned", True) and worker.get("pos"))


def _bracelet_info(
    session: SessionDep, employee: WarehouseEmployee
) -> PersonnelBraceletInfo | None:
    from app.warehouse_sim.bracelets import bracelet_for_employee

    raw = bracelet_for_employee(session, employee)
    if raw is None:
        return None
    runtime = _runtime_device(raw.get("code"))
    if runtime:
        raw = bracelet_for_employee(session, employee, runtime=runtime) or raw
    return PersonnelBraceletInfo(
        device_id=uuid.UUID(raw["device_id"]),
        code=raw["code"],
        name=raw["name"],
        status=raw["status"],
        battery=raw.get("battery"),
        last_signal_at=raw.get("last_signal_at"),
        location_label=raw.get("location_label"),
        location_source=raw.get("location_source"),
        location_stale=bool(raw.get("location_stale")),
        serial_number=raw.get("serial_number"),
        assigned_at=raw.get("assigned_at"),
    )


def _public(
    session: SessionDep,
    employee: WarehouseEmployee,
    worker: dict[str, Any] | None,
) -> PersonnelPublic:
    present = _present(worker)
    bracelet = _bracelet_info(session, employee)
    zone: str | None = None
    motion_status: str | None = None
    person_code: str | None = None
    speed: float | None = None
    if worker is not None and present:
        zone = worker.get("current_zone")
        motion_status = worker.get("status")
        person_code = worker.get("code")
        if worker.get("status") == "walking":
            speed = float(worker.get("speed") or 0.0)
    location_source = None
    location_stale = False
    last_signal = None
    if bracelet:
        location_source = bracelet.location_source
        location_stale = bracelet.location_stale
        last_signal = bracelet.last_signal_at
        if not zone and bracelet.location_label:
            zone = bracelet.location_label
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
        status_until=employee.status_until,
        shift=employee.shift,
        hire_date=employee.hire_date,
        notes=employee.notes,
        created_at=employee.created_at,
        updated_at=employee.updated_at,
        current_zone=zone,
        motion_status=motion_status,
        person_code=person_code,
        speed=speed,
        bracelet=bracelet,
        location_source=location_source,
        location_stale=location_stale,
        last_signal_at=last_signal,
    )


def _get_or_404(session: SessionDep, employee_id: uuid.UUID) -> WarehouseEmployee:
    employee = session.get(WarehouseEmployee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return employee


def _refresh_runtime_links(session: SessionDep) -> None:
    from app.warehouse_sim.runtime import get_runtime

    try:
        get_runtime().sync_personnel_links(session)
    except Exception:
        pass


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
        if status not in EMPLOYEE_STATUSES:
            raise HTTPException(status_code=422, detail="Неизвестный статус сотрудника")
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
    rows = list(
        session.exec(
            stmt.order_by(WarehouseEmployee.last_name, WarehouseEmployee.first_name)
        ).all()
    )
    workers = _runtime_workers()
    data = [_public(session, row, _match_worker(row, workers)) for row in rows]
    return PersonnelList(data=data, count=len(data))


@router.get(
    "/bracelets/available",
    dependencies=[require_permission(PERM_PERSONNEL_READ)],
)
def list_available_bracelets(session: SessionDep, _current_user: CurrentUser) -> Any:
    from app.warehouse_sim.bracelets import list_available_bracelets as available

    data = available(session)
    return {"data": data, "count": len(data)}


@router.get(
    "/departments",
    response_model=PersonnelDepartmentList,
    dependencies=[require_permission(PERM_PERSONNEL_READ)],
)
def list_departments(session: SessionDep, _current_user: CurrentUser) -> Any:
    rows = list(session.exec(select(WarehouseEmployee.department).distinct()).all())
    names = sorted({str(name).strip() for name in rows if name and str(name).strip()})
    for preset in ("Склад №1", "Склад №2", "Склад №3"):
        if preset not in names:
            names.append(preset)
    return PersonnelDepartmentList(data=names, count=len(names))


@router.post(
    "/bulk/department",
    response_model=PersonnelBulkResult,
    dependencies=[require_permission(PERM_PERSONNEL_WRITE)],
)
def bulk_change_department(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    body: PersonnelBulkDepartment,
) -> Any:
    from datetime import datetime, timezone

    department = body.department.strip()
    if not department:
        raise HTTPException(status_code=422, detail="Укажите подразделение")
    ids = list(dict.fromkeys(body.worker_ids))
    employees = list(
        session.exec(
            select(WarehouseEmployee).where(col(WarehouseEmployee.id).in_(ids))
        ).all()
    )
    found = {row.id for row in employees}
    missing = [str(item) for item in ids if item not in found]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Сотрудники не найдены: {', '.join(missing[:5])}",
        )
    now = datetime.now(timezone.utc)
    previous = sorted({row.department for row in employees})
    for row in employees:
        row.department = department
        row.updated_at = now
        session.add(row)
    session.flush()
    log_audit(
        session,
        user_id=current_user.id,
        action="PERSONNEL_BULK_DEPARTMENT_CHANGE",
        resource_type="worker",
        resource_id=None,
        details={
            "count": len(employees),
            "worker_ids": [str(item) for item in ids],
            "previous_departments": previous,
            "department": department,
        },
        ip_address=get_client_ip(request),
    )
    session.commit()
    return PersonnelBulkResult(
        updated=len(employees),
        worker_ids=ids,
        department=department,
        message=f'Сотрудники перемещены в подразделение "{department}".',
    )


@router.post(
    "/bulk/delete",
    response_model=PersonnelBulkResult,
    dependencies=[require_permission(PERM_PERSONNEL_WRITE)],
)
def bulk_delete_employees(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    body: PersonnelBulkIds,
) -> Any:
    from app.warehouse_sim.bracelets import unassign_bracelet

    ids = list(dict.fromkeys(body.worker_ids))
    employees = list(
        session.exec(
            select(WarehouseEmployee).where(col(WarehouseEmployee.id).in_(ids))
        ).all()
    )
    found = {row.id for row in employees}
    missing = [str(item) for item in ids if item not in found]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Сотрудники не найдены: {', '.join(missing[:5])}",
        )
    codes = [row.employee_code for row in employees]
    for row in employees:
        unassign_bracelet(session, employee=row)
        session.delete(row)
    session.flush()
    log_audit(
        session,
        user_id=current_user.id,
        action="PERSONNEL_BULK_DELETE",
        resource_type="worker",
        resource_id=None,
        details={
            "count": len(employees),
            "worker_ids": [str(item) for item in ids],
            "employee_codes": codes,
        },
        ip_address=get_client_ip(request),
    )
    session.commit()
    return PersonnelBulkResult(
        deleted=len(employees),
        worker_ids=ids,
        message=f"Удалено сотрудников: {len(employees)}",
    )


@router.get(
    "/{employee_id}",
    response_model=PersonnelPublic,
    dependencies=[require_permission(PERM_PERSONNEL_READ)],
)
def read_employee(
    session: SessionDep, _current_user: CurrentUser, employee_id: uuid.UUID
) -> Any:
    employee = _get_or_404(session, employee_id)
    worker = _match_worker(employee, _runtime_workers())
    return _public(session, employee, worker)


@router.get(
    "/{employee_id}/bracelet",
    dependencies=[require_permission(PERM_PERSONNEL_READ)],
)
def read_employee_bracelet(
    session: SessionDep, _current_user: CurrentUser, employee_id: uuid.UUID
) -> Any:
    employee = _get_or_404(session, employee_id)
    info = _bracelet_info(session, employee)
    return {"bracelet": info.model_dump() if info else None}


@router.get(
    "/{employee_id}/bracelet/history",
    response_model=PersonnelBraceletHistoryList,
    dependencies=[require_permission(PERM_PERSONNEL_READ)],
)
def read_bracelet_history(
    session: SessionDep, _current_user: CurrentUser, employee_id: uuid.UUID
) -> Any:
    from app.warehouse_sim.bracelets import assignment_history

    _get_or_404(session, employee_id)
    rows = assignment_history(session, employee_id=employee_id)
    data = [PersonnelBraceletHistoryItem(**row) for row in rows]
    return PersonnelBraceletHistoryList(data=data, count=len(data))


@router.post(
    "/{employee_id}/bracelet/assign",
    response_model=PersonnelPublic,
    dependencies=[require_permission(PERM_PERSONNEL_WRITE)],
)
def assign_employee_bracelet(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    employee_id: uuid.UUID,
    body: PersonnelBraceletAssign,
) -> Any:
    from app.warehouse_sim.bracelets import assign_bracelet

    employee = _get_or_404(session, employee_id)
    assignment = assign_bracelet(
        session, employee=employee, device_id=body.device_id, user_id=current_user.id
    )
    log_audit(
        session,
        user_id=current_user.id,
        action="bracelet.assign",
        resource_type="worker",
        resource_id=employee.id,
        details={
            "device_id": str(assignment.device_id),
            "employee_id": str(employee.id),
        },
        ip_address=get_client_ip(request),
    )
    session.commit()
    _refresh_runtime_links(session)
    return _public(session, employee, _match_worker(employee, _runtime_workers()))


@router.post(
    "/{employee_id}/bracelet/unassign",
    response_model=PersonnelPublic,
    dependencies=[require_permission(PERM_PERSONNEL_WRITE)],
)
def unassign_employee_bracelet(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    employee_id: uuid.UUID,
) -> Any:
    from app.warehouse_sim.bracelets import unassign_bracelet

    employee = _get_or_404(session, employee_id)
    assignment = unassign_bracelet(session, employee=employee)
    if assignment is None:
        raise HTTPException(
            status_code=404, detail="У сотрудника нет назначенного браслета"
        )
    log_audit(
        session,
        user_id=current_user.id,
        action="bracelet.unassign",
        resource_type="worker",
        resource_id=employee.id,
        details={
            "device_id": str(assignment.device_id),
            "employee_id": str(employee.id),
        },
        ip_address=get_client_ip(request),
    )
    session.commit()
    _refresh_runtime_links(session)
    return _public(session, employee, _match_worker(employee, _runtime_workers()))


@router.post(
    "/{employee_id}/bracelet/replace",
    response_model=PersonnelPublic,
    dependencies=[require_permission(PERM_PERSONNEL_WRITE)],
)
def replace_employee_bracelet(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    employee_id: uuid.UUID,
    body: PersonnelBraceletAssign,
) -> Any:
    from app.warehouse_sim.bracelets import replace_bracelet

    employee = _get_or_404(session, employee_id)
    assignment = replace_bracelet(
        session,
        employee=employee,
        new_device_id=body.device_id,
        user_id=current_user.id,
    )
    log_audit(
        session,
        user_id=current_user.id,
        action="bracelet.replace",
        resource_type="worker",
        resource_id=employee.id,
        details={
            "device_id": str(assignment.device_id),
            "previous_device_id": str(assignment.previous_device_id)
            if assignment.previous_device_id
            else None,
            "employee_id": str(employee.id),
        },
        ip_address=get_client_ip(request),
    )
    session.commit()
    _refresh_runtime_links(session)
    return _public(session, employee, _match_worker(employee, _runtime_workers()))


@router.get(
    "/{employee_id}/activity",
    response_model=PersonnelActivity,
    dependencies=[require_permission(PERM_PERSONNEL_READ)],
)
def read_activity(
    session: SessionDep, _current_user: CurrentUser, employee_id: uuid.UUID
) -> Any:
    employee = _get_or_404(session, employee_id)
    worker = _match_worker(employee, _runtime_workers())
    present = _present(worker)
    person_code = runtime_id = zone = motion_status = target = task_id = None
    speed = None
    if worker is not None and present:
        person_code = worker.get("code")
        runtime_id = worker.get("id")
        zone = worker.get("current_zone")
        motion_status = worker.get("status")
        target = worker.get("target")
        task_id = worker.get("taskId")
        if worker.get("status") == "walking":
            speed = float(worker.get("speed") or 0.0)
    return PersonnelActivity(
        present=present,
        on_shift=present and employee.status in ("working", "break"),
        person_code=person_code,
        runtime_id=runtime_id,
        zone=zone,
        motion_status=motion_status,
        speed=speed,
        target=target,
        task_id=task_id,
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
        select(WarehouseEmployee).where(
            WarehouseEmployee.employee_code == body.employee_code
        )
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
    return _public(session, employee, None)


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
    if (
        "employee_code" in changes
        and changes["employee_code"] != employee.employee_code
    ):
        taken = session.exec(
            select(WarehouseEmployee).where(
                WarehouseEmployee.employee_code == changes["employee_code"]
            )
        ).first()
        if taken:
            raise HTTPException(status_code=409, detail="Табельный номер уже занят")
    status = changes.get("status", employee.status)
    if status not in EMPLOYEE_STATUSES:
        raise HTTPException(status_code=422, detail="Неизвестный статус сотрудника")
    if "status" in changes or "status_until" in changes:
        until = (
            changes["status_until"]
            if "status_until" in changes
            else employee.status_until
        )
        if status in EMPLOYEE_DATED_STATUSES:
            if until is None:
                raise HTTPException(
                    status_code=422, detail="Укажите дату окончания статуса"
                )
            changes["status_until"] = until
        else:
            changes["status_until"] = None
    employee.sqlmodel_update(changes)
    from datetime import datetime, timezone

    employee.updated_at = datetime.now(timezone.utc)
    session.add(employee)
    session.commit()
    session.refresh(employee)
    log_audit(
        session,
        user_id=current_user.id,
        action="worker.update",
        resource_type="worker",
        resource_id=employee.id,
        details=employee.employee_code,
        ip_address=get_client_ip(request),
    )
    session.commit()
    return _public(session, employee, _match_worker(employee, _runtime_workers()))


@router.delete(
    "/{employee_id}",
    response_model=Message,
    dependencies=[require_permission(PERM_PERSONNEL_WRITE)],
)
def delete_employee(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    employee_id: uuid.UUID,
) -> Any:
    from app.warehouse_sim.bracelets import unassign_bracelet

    employee = _get_or_404(session, employee_id)
    employee_code = employee.employee_code
    unassign_bracelet(session, employee=employee)
    session.delete(employee)
    session.commit()
    log_audit(
        session,
        user_id=current_user.id,
        action="worker.delete",
        resource_type="worker",
        resource_id=employee_id,
        details=employee_code,
        ip_address=get_client_ip(request),
    )
    session.commit()
    return Message(message="Сотрудник удалён")
