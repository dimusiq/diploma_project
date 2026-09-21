"""Persistent Device Server fleet: configuration in wsim_device, runtime in memory."""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, col, select

from app.warehouse_sim.equipment_catalog import SIMULATED_KINDS, category_of
from app.warehouse_sim.layout import build_topology, zone_center
from app.warehouse_sim.models import (
    DEVICE_AGV,
    DEVICE_AMR,
    DEVICE_CHARGING_STATION,
    DEVICE_CONVEYOR,
    DEVICE_DOCK,
    DEVICE_FORKLIFT,
    DEVICE_SCANNER,
    DEVICE_SENSOR,
    DEVICE_STATUS_IDLE,
    DEVICE_STATUS_ONLINE,
    SimDevice,
    SimWarehouse,
)
from app.warehouse_sim.world import DEFAULT_CONFIG, _create_devices, create_device

logger = logging.getLogger(__name__)

KIND_TO_TYPE = {
    "agv": DEVICE_AGV,
    "amr": DEVICE_AMR,
    "forklift": DEVICE_FORKLIFT,
    "scanner": DEVICE_SCANNER,
    "sensor": DEVICE_SENSOR,
    "conveyor": DEVICE_CONVEYOR,
    "dock_door": DEVICE_DOCK,
    "charger": DEVICE_CHARGING_STATION,
}
TYPE_TO_KIND = {v: k for k, v in KIND_TO_TYPE.items()}

SUPPORTED_KINDS = tuple(KIND_TO_TYPE.keys())

KIND_SPEED = {
    "forklift": 2.4,
    "agv": 1.5,
    "amr": 1.9,
}

META_KEYS = (
    "kind",
    "zoneId",
    "metricKind",
    "metricUnit",
    "metricMin",
    "metricMax",
    "metric",
    "health",
    "status",
    "inMaintenance",
    "engineHours",
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def demo_warehouse(session: Session) -> SimWarehouse | None:
    return session.exec(select(SimWarehouse).where(SimWarehouse.code == "DEMO")).first()


def baseline_devices(config: dict | None = None) -> list[dict[str, Any]]:
    topology = build_topology()
    return _create_devices({**DEFAULT_CONFIG, **(config or {})}, topology)


def persist_meta(device: dict[str, Any]) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    for key in META_KEYS:
        if device.get(key) is not None:
            meta[key] = device[key]
    return meta


def row_to_runtime(row: SimDevice) -> dict[str, Any]:
    meta = dict(row.meta or {})
    kind = str(meta.get("kind") or TYPE_TO_KIND.get(row.device_type) or "agv")
    overrides: dict[str, Any] = {
        k: v for k, v in meta.items() if k not in {"kind"}
    }
    overrides["speed"] = float(row.speed_mps or 0)
    overrides["battery"] = row.battery
    overrides["enabled"] = bool(row.enabled)
    overrides["online"] = bool(row.enabled)
    overrides["inMaintenance"] = bool(meta.get("inMaintenance"))
    if not row.enabled:
        overrides["status"] = "offline"
    elif overrides["inMaintenance"]:
        overrides["status"] = "maintenance"
    return create_device(
        row.code,
        kind,
        row.name,
        {"x": row.home_x, "z": row.home_y},
        **overrides,
    )


def device_to_row_kwargs(warehouse_id: uuid.UUID, device: dict[str, Any]) -> dict[str, Any]:
    dtype = KIND_TO_TYPE.get(device["kind"])
    if not dtype:
        raise ValueError(f"Неизвестный тип устройства: {device.get('kind')}")
    now = _utcnow()
    return {
        "warehouse_id": warehouse_id,
        "code": str(device["id"])[:64],
        "name": str(device["name"])[:64],
        "description": None,
        "device_type": dtype,
        "enabled": True,
        "archived": False,
        "status": DEVICE_STATUS_IDLE if device.get("status") == "idle" else DEVICE_STATUS_ONLINE,
        "battery": device.get("battery"),
        "x": device["pos"]["x"],
        "y": device["pos"]["z"],
        "home_x": device["homePos"]["x"],
        "home_y": device["homePos"]["z"],
        "speed_mps": float(device.get("speed") or 0),
        "meta": persist_meta(device),
        "created_at": now,
        "updated_at": now,
    }


def ensure_fleet_seed(session: Session) -> None:
    """Дописывает code/meta существующему DEMO-парку, не меняя состав."""
    warehouse = demo_warehouse(session)
    if warehouse is None:
        return
    rows = list(
        session.exec(select(SimDevice).where(SimDevice.warehouse_id == warehouse.id)).all()
    )
    baseline = {d["name"]: d for d in baseline_devices()}
    used_codes = {r.code for r in rows if r.code}
    changed = False
    for row in rows:
        match = baseline.get(row.name)
        if not row.code:
            code = match["id"] if match else re.sub(r"[^a-zA-Z0-9._-]+", "-", row.name).strip("-").lower()
            while code in used_codes:
                code = f"{code}-x"
            row.code = code[:64]
            used_codes.add(row.code)
            changed = True
        if match and not row.meta:
            row.meta = persist_meta(match)
            row.speed_mps = float(match.get("speed") or row.speed_mps)
            row.battery = match.get("battery") if row.battery is None else row.battery
            changed = True
        session.add(row)
    if not rows:
        for device in baseline_devices():
            session.add(SimDevice(**device_to_row_kwargs(warehouse.id, device)))
        changed = True
    if changed:
        session.commit()
        logger.info("Warehouse fleet: synchronized DEMO device codes")


def list_config_devices(session: Session, *, include_archived: bool = False) -> list[SimDevice]:
    warehouse = demo_warehouse(session)
    if warehouse is None:
        return []
    stmt = select(SimDevice).where(SimDevice.warehouse_id == warehouse.id)
    if not include_archived:
        stmt = stmt.where(SimDevice.archived.is_(False))
    return list(session.exec(stmt.order_by(col(SimDevice.code))).all())


def load_active_runtime_devices(session: Session) -> list[dict[str, Any]] | None:
    """Активный persistent-парк. None — склада ещё нет, вызывающий код берёт hardcoded baseline."""
    ensure_fleet_seed(session)
    warehouse = demo_warehouse(session)
    if warehouse is None:
        return None
    rows = [
        row
        for row in list_config_devices(session)
        if row.enabled and not row.archived
    ]
    return [row_to_runtime(row) for row in rows]


def get_device_row(session: Session, device_id: uuid.UUID) -> SimDevice:
    row = session.get(SimDevice, device_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Устройство не найдено")
    return row


def _next_code(session: Session, warehouse_id: uuid.UUID, kind: str) -> str:
    prefix = {
        "forklift": "fl",
        "agv": "agv",
        "amr": "amr",
        "conveyor": "cnv",
        "dock_door": "dock",
        "scanner": "scn",
        "sensor": "sns",
        "charger": "chg",
    }.get(kind, kind[:3])
    existing = session.exec(
        select(SimDevice.code).where(SimDevice.warehouse_id == warehouse_id)
    ).all()
    n = 1
    while f"{prefix}-{n}" in existing:
        n += 1
    return f"{prefix}-{n}"


def create_fleet_device(session: Session, body: dict[str, Any]) -> SimDevice:
    warehouse = demo_warehouse(session)
    if warehouse is None:
        raise HTTPException(status_code=409, detail="Склад симулятора ещё не инициализирован")
    kind = str(body.get("kind") or "")
    if kind not in KIND_TO_TYPE:
        raise HTTPException(status_code=400, detail="Неподдерживаемый тип техники")
    code = str(body.get("code") or _next_code(session, warehouse.id, kind)).strip()
    if not code:
        raise HTTPException(status_code=400, detail="Код не может быть пустым")
    dup = session.exec(
        select(SimDevice).where(
            SimDevice.warehouse_id == warehouse.id,
            SimDevice.code == code,
        )
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail="Код устройства уже занят")
    charging = zone_center("zone-chrg", build_topology()["zones"])
    home = body.get("home") or {}
    home_x = float(home.get("x") if home.get("x") is not None else charging.x)
    home_z = float(home.get("z") if home.get("z") is not None else charging.z)
    name = str(body.get("name") or code.upper())[:64]
    name_dup = session.exec(
        select(SimDevice).where(
            SimDevice.warehouse_id == warehouse.id,
            SimDevice.name == name,
        )
    ).first()
    if name_dup:
        raise HTTPException(status_code=409, detail="Имя устройства уже занято")
    speed = body.get("speed")
    if speed is None:
        speed = KIND_SPEED.get(kind, 0.0)
    battery = body.get("battery")
    if battery is None and kind in ("forklift", "agv", "amr"):
        battery = 80.0
    configuration = body.get("configuration") if isinstance(body.get("configuration"), dict) else {}
    device_dict = create_device(
        code,
        kind,
        name,
        {"x": home_x, "z": home_z},
        speed=float(speed or 0),
        battery=battery,
        zoneId=configuration.get("zoneId"),
        metricKind=configuration.get("metricKind"),
        metricUnit=configuration.get("metricUnit"),
        metricMin=configuration.get("metricMin"),
        metricMax=configuration.get("metricMax"),
        metric=configuration.get("metric"),
    )
    kwargs = device_to_row_kwargs(warehouse.id, device_dict)
    kwargs["description"] = str(body["description"])[:255] if body.get("description") else None
    kwargs["enabled"] = bool(body.get("enabled", True))
    row = SimDevice(**kwargs)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def patch_fleet_device(session: Session, device_id: uuid.UUID, body: dict[str, Any]) -> SimDevice:
    row = get_device_row(session, device_id)
    if row.archived and body.get("archived") is not False:
        raise HTTPException(status_code=409, detail="Архивное устройство нельзя изменить")
    if "name" in body and body["name"] is not None:
        name = str(body["name"]).strip()[:64]
        if not name:
            raise HTTPException(status_code=400, detail="Имя не может быть пустым")
        dup = session.exec(
            select(SimDevice).where(
                SimDevice.warehouse_id == row.warehouse_id,
                SimDevice.name == name,
                SimDevice.id != row.id,
            )
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail="Имя устройства уже занято")
        row.name = name
    if "description" in body:
        row.description = str(body["description"])[:255] if body["description"] else None
    if "code" in body and body["code"] is not None:
        code = str(body["code"]).strip()[:64]
        if not code:
            raise HTTPException(status_code=400, detail="Код не может быть пустым")
        dup = session.exec(
            select(SimDevice).where(
                SimDevice.warehouse_id == row.warehouse_id,
                SimDevice.code == code,
                SimDevice.id != row.id,
            )
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail="Код устройства уже занят")
        row.code = code
    if "kind" in body and body["kind"] is not None:
        kind = str(body["kind"])
        if kind not in KIND_TO_TYPE:
            raise HTTPException(status_code=400, detail="Неподдерживаемый тип техники")
        row.device_type = KIND_TO_TYPE[kind]
        meta = dict(row.meta or {})
        meta["kind"] = kind
        row.meta = meta
    if "enabled" in body and body["enabled"] is not None:
        row.enabled = bool(body["enabled"])
    if "archived" in body and body["archived"] is not None:
        row.archived = bool(body["archived"])
        if row.archived:
            row.enabled = False
    if "speed" in body and body["speed"] is not None:
        row.speed_mps = float(body["speed"])
    if "battery" in body:
        row.battery = body["battery"]
    if "inMaintenance" in body and body["inMaintenance"] is not None:
        meta = dict(row.meta or {})
        meta["inMaintenance"] = bool(body["inMaintenance"])
        row.meta = meta
    if "engineHours" in body and body["engineHours"] is not None:
        meta = dict(row.meta or {})
        meta["engineHours"] = int(body["engineHours"])
        row.meta = meta
    if isinstance(body.get("configuration"), dict):
        meta = dict(row.meta or {})
        for key, value in body["configuration"].items():
            if key in {"kind", "status", "health"}:
                continue
            meta[key] = value
        row.meta = meta
    row.updated_at = _utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def archive_fleet_device(session: Session, device_id: uuid.UUID) -> SimDevice:
    return patch_fleet_device(session, device_id, {"archived": True, "enabled": False})


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def serialize_fleet_device(
    row: SimDevice,
    runtime: dict[str, Any] | None = None,
    *,
    maintenance: dict[str, Any] | None = None,
    deferred: list[str] | None = None,
) -> dict[str, Any]:
    meta = dict(row.meta or {})
    kind = str(meta.get("kind") or TYPE_TO_KIND.get(row.device_type) or "agv")
    rt = runtime or {}
    pos = rt.get("pos") or {"x": row.x, "z": row.y}
    in_maintenance = bool(meta.get("inMaintenance"))
    status = rt.get("status") if rt else None
    if in_maintenance and not rt.get("taskId"):
        status = "maintenance"
    engine_hours = meta.get("engineHours")
    if engine_hours is not None:
        try:
            engine_hours = int(engine_hours)
        except (TypeError, ValueError):
            engine_hours = None
    elif rt.get("busySec"):
        engine_hours = int(float(rt["busySec"]) // 3600)
    return {
        "id": str(row.id),
        "code": row.code,
        "name": row.name,
        "description": row.description,
        "category": category_of(kind),
        "kind": kind,
        "device_type": row.device_type,
        "enabled": bool(row.enabled),
        "archived": bool(row.archived),
        "simulated": kind in SIMULATED_KINDS,
        "inMaintenance": in_maintenance,
        "configuration": {
            "speed": float(row.speed_mps or 0),
            "battery": row.battery,
            "home": {"x": row.home_x, "z": row.home_y},
            "zoneId": meta.get("zoneId"),
            "metricKind": meta.get("metricKind"),
            "metricUnit": meta.get("metricUnit"),
            "metricMin": meta.get("metricMin"),
            "metricMax": meta.get("metricMax"),
            "metric": meta.get("metric"),
            "inMaintenance": in_maintenance,
        },
        "runtime": {
            "status": status,
            "online": False if in_maintenance and not rt.get("taskId") else rt.get("online"),
            "battery": rt.get("battery"),
            "position": pos,
            "taskId": rt.get("taskId"),
            "metric": rt.get("metric"),
            "metricKind": rt.get("metricKind") or meta.get("metricKind"),
            "metricUnit": rt.get("metricUnit") or meta.get("metricUnit"),
            "lastSeen": rt.get("lastSeen"),
            "lastEventAt": rt.get("lastEventAt"),
            "busySec": rt.get("busySec"),
            "inSimulation": bool(rt),
            "inMaintenance": in_maintenance,
        },
        "maintenance": maintenance,
        "engine_hours": engine_hours,
        "deferredUntilRestart": deferred or [],
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
    }
