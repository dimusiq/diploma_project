"""Назначение браслетов-радиомаяков сотрудникам склада.

Браслет — обычный wsim_device (kind=radio_beacon). Связь хранится в
wsim_bracelet_assignment с историей. Runtime-положение сотрудника остаётся
у SimPerson; браслет зеркалит координаты назначенного работника.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.models import WarehouseEmployee
from app.warehouse_sim.fleet import TYPE_TO_KIND, get_device_row
from app.warehouse_sim.models import (
    DEVICE_RADIO_BEACON,
    DEVICE_STATUS_MAINTENANCE,
    DEVICE_STATUS_OFFLINE,
    DEVICE_STATUS_ONLINE,
    SimBraceletAssignment,
    SimDevice,
)

KIND_RADIO_BEACON = "radio_beacon"

LOCATION_SIMULATION = "simulation"
LOCATION_RADIO_BEACON = "radio_beacon"
LOCATION_UNKNOWN = "unknown"
LOCATION_SOURCES = (LOCATION_SIMULATION, LOCATION_RADIO_BEACON, LOCATION_UNKNOWN)

DEMO_BRACELET_SPECS = (
    {
        "code": "rb-1",
        "name": "RB-001",
        "description": "Браслет RB-001",
        "serial": "SN-RB-001",
        "employee_id": uuid.UUID("11111111-1111-4111-8111-111111111001"),
        "battery": 88.0,
        "x": 10.0,
        "z": 12.0,
    },
    {
        "code": "rb-2",
        "name": "RB-002",
        "description": "Браслет RB-002",
        "serial": "SN-RB-002",
        "employee_id": uuid.UUID("11111111-1111-4111-8111-111111111002"),
        "battery": 84.0,
        "x": 12.0,
        "z": 12.0,
    },
    {
        "code": "rb-3",
        "name": "RB-003",
        "description": "Браслет RB-003",
        "serial": "SN-RB-003",
        "employee_id": uuid.UUID("11111111-1111-4111-8111-111111111003"),
        "battery": 80.0,
        "x": 14.0,
        "z": 12.0,
    },
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def is_bracelet(row: SimDevice) -> bool:
    meta = row.meta or {}
    kind = str(meta.get("kind") or TYPE_TO_KIND.get(row.device_type) or "")
    return row.device_type == DEVICE_RADIO_BEACON or kind == KIND_RADIO_BEACON


def device_status_label(row: SimDevice, runtime: dict[str, Any] | None = None) -> str:
    meta = row.meta or {}
    if row.archived or not row.enabled:
        return "offline"
    if meta.get("inMaintenance") or row.status == DEVICE_STATUS_MAINTENANCE:
        return "maintenance"
    if runtime:
        if runtime.get("online") is False or runtime.get("status") == "offline":
            return "offline"
        return "online"
    if row.status == DEVICE_STATUS_OFFLINE:
        return "offline"
    return "online"


def employee_full_name(employee: WarehouseEmployee) -> str:
    parts = [employee.last_name, employee.first_name, employee.middle_name]
    return " ".join(part for part in parts if part)


def active_assignment_for_device(
    session: Session, device_id: uuid.UUID
) -> SimBraceletAssignment | None:
    return session.exec(
        select(SimBraceletAssignment).where(
            SimBraceletAssignment.device_id == device_id,
            SimBraceletAssignment.unassigned_at.is_(None),
        )
    ).first()


def active_assignment_for_employee(
    session: Session, employee_id: uuid.UUID
) -> SimBraceletAssignment | None:
    return session.exec(
        select(SimBraceletAssignment).where(
            SimBraceletAssignment.employee_id == employee_id,
            SimBraceletAssignment.unassigned_at.is_(None),
        )
    ).first()


def active_assignments_map(
    session: Session, *, device_ids: list[uuid.UUID] | None = None
) -> dict[uuid.UUID, SimBraceletAssignment]:
    stmt = select(SimBraceletAssignment).where(SimBraceletAssignment.unassigned_at.is_(None))
    if device_ids is not None:
        if not device_ids:
            return {}
        stmt = stmt.where(col(SimBraceletAssignment.device_id).in_(device_ids))
    rows = list(session.exec(stmt).all())
    return {row.device_id: row for row in rows}


def _require_bracelet(session: Session, device_id: uuid.UUID) -> SimDevice:
    row = get_device_row(session, device_id)
    if not is_bracelet(row):
        raise HTTPException(status_code=400, detail="Устройство не является браслетом-радиомаяком")
    return row


def _assert_assignable(row: SimDevice) -> None:
    if row.archived:
        raise HTTPException(status_code=409, detail="Архивированный браслет нельзя назначить")
    if not row.enabled:
        raise HTTPException(status_code=409, detail="Отключённый браслет нельзя назначить")
    meta = row.meta or {}
    if meta.get("inMaintenance") or row.status == DEVICE_STATUS_MAINTENANCE:
        raise HTTPException(status_code=409, detail="Браслет на обслуживании нельзя назначить")


def list_available_bracelets(session: Session) -> list[dict[str, Any]]:
    rows = list(
        session.exec(
            select(SimDevice)
            .where(SimDevice.device_type == DEVICE_RADIO_BEACON)
            .where(SimDevice.archived.is_(False))
            .order_by(col(SimDevice.code))
        ).all()
    )
    busy = active_assignments_map(session, device_ids=[row.id for row in rows])
    available: list[dict[str, Any]] = []
    for row in rows:
        if row.id in busy:
            continue
        if not row.enabled:
            continue
        meta = row.meta or {}
        if meta.get("inMaintenance"):
            continue
        available.append(_bracelet_summary(row, assignment=None, employee=None))
    return available


def _bracelet_summary(
    row: SimDevice,
    *,
    assignment: SimBraceletAssignment | None,
    employee: WarehouseEmployee | None,
    runtime: dict[str, Any] | None = None,
) -> dict[str, Any]:
    meta = dict(row.meta or {})
    rt = runtime or {}
    last_signal = meta.get("lastSignalAt")
    location_source = meta.get("locationSource") or LOCATION_UNKNOWN
    location_stale = bool(meta.get("locationStale"))
    zone = meta.get("lastZone") or meta.get("zoneId") or rt.get("current_zone")
    if rt.get("pos") and not location_stale:
        zone = rt.get("current_zone") or zone
    return {
        "device_id": str(row.id),
        "code": row.code,
        "name": row.name,
        "description": row.description,
        "serial_number": meta.get("serialNumber"),
        "status": device_status_label(row, runtime),
        "battery": rt.get("battery") if rt.get("battery") is not None else row.battery,
        "last_signal_at": last_signal,
        "location_label": zone,
        "location_source": location_source,
        "location_stale": location_stale,
        "position": rt.get("pos") or {"x": row.x, "z": row.y},
        "assigned_at": _iso(assignment.assigned_at) if assignment else None,
        "employee": (
            {
                "id": str(employee.id),
                "employee_code": employee.employee_code,
                "full_name": employee_full_name(employee),
            }
            if employee
            else None
        ),
        "created_at": _iso(row.created_at),
    }


def bracelet_for_employee(
    session: Session,
    employee: WarehouseEmployee,
    *,
    runtime: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    assignment = active_assignment_for_employee(session, employee.id)
    if assignment is None:
        return None
    row = session.get(SimDevice, assignment.device_id)
    if row is None:
        return None
    return _bracelet_summary(row, assignment=assignment, employee=employee, runtime=runtime)


def assignment_history(
    session: Session, *, employee_id: uuid.UUID | None = None, device_id: uuid.UUID | None = None
) -> list[dict[str, Any]]:
    stmt = select(SimBraceletAssignment).order_by(col(SimBraceletAssignment.assigned_at).desc())
    if employee_id is not None:
        stmt = stmt.where(SimBraceletAssignment.employee_id == employee_id)
    if device_id is not None:
        stmt = stmt.where(SimBraceletAssignment.device_id == device_id)
    rows = list(session.exec(stmt.limit(100)).all())
    result: list[dict[str, Any]] = []
    for row in rows:
        device = session.get(SimDevice, row.device_id)
        employee = (
            session.get(WarehouseEmployee, row.employee_id) if row.employee_id else None
        )
        previous = session.get(SimDevice, row.previous_device_id) if row.previous_device_id else None
        result.append(
            {
                "id": str(row.id),
                "device_id": str(row.device_id),
                "device_code": device.code if device else None,
                "device_name": device.name if device else None,
                "employee_id": str(row.employee_id) if row.employee_id else None,
                "employee_code": employee.employee_code if employee else None,
                "employee_name": employee_full_name(employee) if employee else None,
                "assigned_at": _iso(row.assigned_at),
                "unassigned_at": _iso(row.unassigned_at),
                "previous_device_id": str(row.previous_device_id) if row.previous_device_id else None,
                "previous_device_code": previous.code if previous else None,
                "notes": row.notes,
                "active": row.unassigned_at is None,
            }
        )
    return result


def assign_bracelet(
    session: Session,
    *,
    employee: WarehouseEmployee,
    device_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
    previous_device_id: uuid.UUID | None = None,
    notes: str | None = None,
) -> SimBraceletAssignment:
    row = _require_bracelet(session, device_id)
    _assert_assignable(row)
    if active_assignment_for_device(session, device_id) is not None:
        raise HTTPException(status_code=409, detail="Браслет уже закреплён за другим сотрудником")
    if active_assignment_for_employee(session, employee.id) is not None:
        raise HTTPException(
            status_code=409,
            detail="У сотрудника уже есть активный браслет. Сначала снимите или замените его.",
        )
    assignment = SimBraceletAssignment(
        device_id=device_id,
        employee_id=employee.id,
        assigned_at=_utcnow(),
        assigned_by_user_id=user_id,
        previous_device_id=previous_device_id,
        notes=notes,
    )
    session.add(assignment)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Нарушено ограничение назначения браслета",
        ) from exc
    return assignment


def unassign_bracelet(
    session: Session,
    *,
    employee: WarehouseEmployee,
) -> SimBraceletAssignment | None:
    assignment = active_assignment_for_employee(session, employee.id)
    if assignment is None:
        return None
    assignment.unassigned_at = _utcnow()
    session.add(assignment)
    session.flush()
    return assignment


def replace_bracelet(
    session: Session,
    *,
    employee: WarehouseEmployee,
    new_device_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
) -> SimBraceletAssignment:
    """Атомарно: снять текущий браслет и назначить новый."""
    current = active_assignment_for_employee(session, employee.id)
    previous_id = current.device_id if current else None
    if current is not None:
        if current.device_id == new_device_id:
            return current
        current.unassigned_at = _utcnow()
        session.add(current)
        session.flush()
    try:
        return assign_bracelet(
            session,
            employee=employee,
            device_id=new_device_id,
            user_id=user_id,
            previous_device_id=previous_id,
            notes="replace" if previous_id else None,
        )
    except HTTPException:
        # Откат незакоммиченных изменений вызывающей стороной; здесь re-raise.
        raise


def enrich_fleet_payload(
    session: Session,
    payload: dict[str, Any],
    row: SimDevice,
    *,
    assignments: dict[uuid.UUID, SimBraceletAssignment] | None = None,
) -> dict[str, Any]:
    meta = dict(row.meta or {})
    payload["serial_number"] = meta.get("serialNumber")
    payload["last_signal_at"] = meta.get("lastSignalAt")
    payload["location_source"] = meta.get("locationSource")
    payload["location_stale"] = bool(meta.get("locationStale"))
    payload["assigned_employee"] = None
    if not is_bracelet(row):
        return payload
    map_ = assignments if assignments is not None else active_assignments_map(session, device_ids=[row.id])
    assignment = map_.get(row.id)
    if assignment is None:
        return payload
    employee = session.get(WarehouseEmployee, assignment.employee_id)
    if employee is None:
        return payload
    payload["assigned_employee"] = {
        "id": str(employee.id),
        "employee_code": employee.employee_code,
        "full_name": employee_full_name(employee),
    }
    return payload


def sync_runtime_links(session: Session, world: dict[str, Any]) -> None:
    """Проставляет в world связи браслет→сотрудник для зеркалирования координат."""
    rows = list(
        session.exec(select(SimDevice).where(SimDevice.device_type == DEVICE_RADIO_BEACON)).all()
    )
    assignments = active_assignments_map(session, device_ids=[row.id for row in rows])
    links: list[dict[str, Any]] = []
    for row in rows:
        assignment = assignments.get(row.id)
        employee = session.get(WarehouseEmployee, assignment.employee_id) if assignment else None
        links.append(
            {
                "deviceId": row.code,
                "deviceUuid": str(row.id),
                "employeeId": str(employee.id) if employee else None,
                "employeeCode": employee.employee_code if employee else None,
            }
        )
    world["braceletLinks"] = links


def apply_bracelet_positions(world: dict[str, Any]) -> None:
    """Зеркалит позицию SimPerson на назначенный браслет. Источник — simulation."""
    links = world.get("braceletLinks") or []
    if not links:
        return
    workers = list(world.get("workers") or [])
    by_code = {
        w.get("employeeCode"): w for w in workers if w.get("employeeCode")
    }
    by_id = {str(w.get("workerId") or ""): w for w in workers if w.get("workerId")}
    devices = world.get("deviceById") or {}
    now_iso = _iso(_utcnow())
    sim_time = float(world.get("timeSec") or 0)
    for link in links:
        device = devices.get(link["deviceId"])
        if device is None or device.get("kind") != KIND_RADIO_BEACON:
            continue
        employee_code = link.get("employeeCode")
        employee_id = link.get("employeeId")
        worker = None
        if employee_code:
            worker = by_code.get(employee_code)
        if worker is None and employee_id:
            worker = by_id.get(str(employee_id))
        device["locationSource"] = LOCATION_SIMULATION
        if worker and worker.get("pos") and worker.get("spawned", True):
            device["pos"] = dict(worker["pos"])
            device["current_zone"] = worker.get("current_zone")
            device["lastSignalAt"] = now_iso
            device["lastSignalSimSec"] = sim_time
            device["locationStale"] = False
            device["online"] = bool(device.get("enabled", True))
            if device.get("enabled", True) and not device.get("inMaintenance"):
                device["status"] = "idle"
            device["battery"] = device.get("battery")
        else:
            # Потеря связи / сотрудник вне смены: координаты не трогаем.
            device["locationStale"] = True
            if device.get("enabled", True) and not device.get("inMaintenance"):
                device["status"] = "offline"
                device["online"] = False


def persist_bracelet_signal_meta(session: Session, world: dict[str, Any]) -> None:
    """Редко сбрасывает lastSignalAt/location в meta БД (не каждый тик)."""
    links = world.get("braceletLinks") or []
    if not links:
        return
    devices = world.get("deviceById") or {}
    for link in links:
        device = devices.get(link["deviceId"])
        if device is None:
            continue
        row = session.get(SimDevice, uuid.UUID(link["deviceUuid"])) if link.get("deviceUuid") else None
        if row is None:
            continue
        meta = dict(row.meta or {})
        changed = False
        for key, src in (
            ("lastSignalAt", "lastSignalAt"),
            ("locationSource", "locationSource"),
            ("locationStale", "locationStale"),
            ("lastZone", "current_zone"),
        ):
            value = device.get(src)
            if value is not None and meta.get(key) != value:
                meta[key] = value
                changed = True
        if device.get("pos"):
            row.x = float(device["pos"]["x"])
            row.y = float(device["pos"]["z"])
            changed = True
        if changed:
            row.meta = meta
            row.updated_at = _utcnow()
            if device.get("online") is False:
                row.status = DEVICE_STATUS_OFFLINE
            elif device.get("inMaintenance"):
                row.status = DEVICE_STATUS_MAINTENANCE
            else:
                row.status = DEVICE_STATUS_ONLINE
            session.add(row)


def ensure_demo_bracelets(session: Session, warehouse_id: uuid.UUID) -> None:
    """Создаёт демо-браслеты и назначения, если их ещё нет."""
    from app.warehouse_sim.fleet import KIND_TO_TYPE, persist_meta
    from app.warehouse_sim.world import create_device

    now = _utcnow()
    for spec in DEMO_BRACELET_SPECS:
        row = session.exec(
            select(SimDevice).where(
                SimDevice.warehouse_id == warehouse_id,
                SimDevice.code == spec["code"],
            )
        ).first()
        if row is None:
            device = create_device(
                spec["code"],
                KIND_RADIO_BEACON,
                spec["name"],
                {"x": spec["x"], "z": spec["z"]},
                battery=spec["battery"],
                zoneId="zone-storage",
                serialNumber=spec["serial"],
                locationSource=LOCATION_SIMULATION,
            )
            row = SimDevice(
                warehouse_id=warehouse_id,
                code=spec["code"],
                name=spec["name"],
                description=spec["description"],
                device_type=KIND_TO_TYPE[KIND_RADIO_BEACON],
                enabled=True,
                archived=False,
                status=DEVICE_STATUS_ONLINE,
                battery=spec["battery"],
                x=spec["x"],
                y=spec["z"],
                home_x=spec["x"],
                home_y=spec["z"],
                speed_mps=0.0,
                meta=persist_meta(device),
                created_at=now,
                updated_at=now,
            )
            session.add(row)
            session.flush()
        employee = session.get(WarehouseEmployee, spec["employee_id"])
        if employee is None:
            continue
        if active_assignment_for_device(session, row.id):
            continue
        if active_assignment_for_employee(session, employee.id):
            continue
        session.add(
            SimBraceletAssignment(
                device_id=row.id,
                employee_id=employee.id,
                assigned_at=now,
                notes="demo seed",
            )
        )
    session.flush()


