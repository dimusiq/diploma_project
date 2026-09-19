"""HTTP API Warehouse Device Server.

Чтение live-состояния доступно любому авторизованному пользователю (Digital Twin).
Управление runtime — только ROLE_ADMIN или суперпользователь (Device Monitor).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.api.deps import CurrentUser, SessionDep, get_current_warehouse_sim_admin
from app.core.audit import get_client_ip, log_audit
from app.models import User
from app.warehouse_sim.device_maintenance import (
    create_maintenance,
    get_maintenance,
    list_maintenance,
    maintenance_summaries,
    maintenance_summary,
    patch_maintenance,
    serialize_maintenance,
)
from app.warehouse_sim.equipment_catalog import equipment_catalog
from app.warehouse_sim.events import ALL_EVENT_TYPES, MANUAL_EVENT_TYPES
from app.warehouse_sim.fleet import (
    SUPPORTED_KINDS,
    archive_fleet_device,
    create_fleet_device,
    get_device_row,
    list_config_devices,
    patch_fleet_device,
    serialize_fleet_device,
)
from app.warehouse_sim.runtime import get_runtime, query_event_log, sse_stream
from app.warehouse_sim.scenarios import SCENARIO_DEFS
from app.warehouse_sim.schemas import (
    ApplyScenarioBody,
    DeviceCommandBody,
    DeviceFleetCreate,
    DeviceFleetPatch,
    DeviceMaintenanceCreate,
    DeviceMaintenancePatch,
    FastForwardBody,
    ManualEventBody,
    SimCommandBody,
    SimConfigPatch,
    SimControlBody,
    SimSpeedBody,
)

SimAdmin = Annotated[User, Depends(get_current_warehouse_sim_admin)]

router = APIRouter(prefix="/warehouse-sim", tags=["warehouse-device-server"])


@router.get("/snapshot")
def read_snapshot(_user: CurrentUser) -> dict[str, Any]:
    return get_runtime().data()


@router.get("/motion")
def read_motion(_user: CurrentUser) -> dict[str, Any]:
    return get_runtime().motion()


@router.get("/kpi")
def read_kpi(_user: CurrentUser) -> dict[str, Any]:
    data = get_runtime().data()
    return data.get("kpi") or {}


@router.get("/layout")
def read_layout(_user: CurrentUser) -> dict[str, Any]:
    return get_runtime().world["topology"]


@router.get("/devices")
def list_devices(_user: CurrentUser) -> dict[str, Any]:
    rt = get_runtime()
    return {"data": rt.devices.get_devices(), "count": len(rt.world["devices"])}


@router.get("/devices/{device_id}")
def read_device(_user: CurrentUser, device_id: str) -> dict[str, Any]:
    try:
        return get_runtime().devices.get_device_telemetry(device_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Устройство не найдено") from exc


def _runtime_by_code() -> dict[str, dict[str, Any]]:
    return {device["id"]: device for device in get_runtime().world["devices"]}


@router.get("/fleet")
def list_fleet(
    session: SessionDep,
    _user: CurrentUser,
    include_archived: bool = Query(default=False),
    category: str | None = Query(default=None),
    kind: str | None = Query(default=None),
) -> dict[str, Any]:
    rows = list_config_devices(session, include_archived=include_archived)
    runtime = _runtime_by_code()
    summaries = maintenance_summaries(session, [row.id for row in rows])
    data = [
        serialize_fleet_device(
            row, runtime.get(row.code), maintenance=summaries.get(row.id)
        )
        for row in rows
    ]
    if category and category != "all":
        data = [row for row in data if row["category"] == category]
    if kind:
        data = [row for row in data if row["kind"] == kind]
    catalog = equipment_catalog()
    return {
        "data": data,
        "count": len(data),
        "kinds": list(SUPPORTED_KINDS),
        **catalog,
    }


@router.post("/fleet")
def create_fleet(session: SessionDep, _user: SimAdmin, body: DeviceFleetCreate) -> dict[str, Any]:
    row = create_fleet_device(session, body.model_dump())
    get_runtime().sync_fleet_device(row)
    return serialize_fleet_device(row, _runtime_by_code().get(row.code))


@router.get("/fleet/{device_id}")
def read_fleet_device(session: SessionDep, _user: CurrentUser, device_id: uuid.UUID) -> dict[str, Any]:
    row = get_device_row(session, device_id)
    return serialize_fleet_device(
        row,
        _runtime_by_code().get(row.code),
        maintenance=maintenance_summary(session, row.id),
    )


@router.patch("/fleet/{device_id}")
def patch_fleet(
    session: SessionDep,
    request: Request,
    user: SimAdmin,
    device_id: uuid.UUID,
    body: DeviceFleetPatch,
) -> dict[str, Any]:
    patch = body.model_dump(exclude_unset=True)
    row = get_device_row(session, device_id)
    previous_code = row.code
    runtime_device = _runtime_by_code().get(previous_code)
    rt = get_runtime()
    if patch.get("inMaintenance") and runtime_device and runtime_device.get("taskId"):
        raise HTTPException(
            status_code=409,
            detail="Оборудование выполняет задачу. Перевод в техническое обслуживание требует завершения или остановки текущей задачи",
        )
    if rt.state == "RUNNING" and runtime_device and runtime_device.get("taskId"):
        if "kind" in patch or "code" in patch:
            raise HTTPException(
                status_code=409,
                detail="Тип и код нельзя менять, пока устройство выполняет задание",
            )
    deferred: list[str] = []
    if rt.state == "RUNNING":
        if "speed" in patch:
            deferred.append("speed")
        if "kind" in patch:
            deferred.append("kind")
    row = patch_fleet_device(session, device_id, patch)
    rt.sync_fleet_device(row, previous_code=previous_code)
    log_audit(
        session,
        user_id=user.id,
        action="fleet.update",
        resource_type="wsim_device",
        resource_id=row.id,
        details={k: patch[k] for k in patch if k != "configuration"} | (
            {"configuration": patch["configuration"]} if "configuration" in patch else {}
        ),
        ip_address=get_client_ip(request),
    )
    session.commit()
    return serialize_fleet_device(
        row,
        _runtime_by_code().get(row.code) or _runtime_by_code().get(previous_code),
        maintenance=maintenance_summary(session, row.id),
        deferred=deferred,
    )


@router.delete("/fleet/{device_id}")
def delete_fleet_device(
    session: SessionDep, request: Request, user: SimAdmin, device_id: uuid.UUID
) -> dict[str, Any]:
    row = archive_fleet_device(session, device_id)
    get_runtime().sync_fleet_device(row)
    log_audit(
        session,
        user_id=user.id,
        action="fleet.archive",
        resource_type="wsim_device",
        resource_id=row.id,
        details={"code": row.code},
        ip_address=get_client_ip(request),
    )
    session.commit()
    return serialize_fleet_device(row, _runtime_by_code().get(row.code))


@router.get("/fleet/{device_id}/tasks")
def list_fleet_device_tasks(_user: CurrentUser, device_id: uuid.UUID, session: SessionDep) -> dict[str, Any]:
    row = get_device_row(session, device_id)
    tasks = [
        task
        for task in get_runtime().world["tasks"]
        if task.get("deviceId") == row.code
    ]
    return {"data": tasks[-40:], "count": len(tasks)}


@router.get("/fleet/{device_id}/events")
def list_fleet_device_events(
    session: SessionDep,
    _user: CurrentUser,
    device_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    row = get_device_row(session, device_id)
    return query_event_log(
        session,
        get_runtime(),
        device_id=row.code,
        skip=skip,
        limit=limit,
    )


@router.get("/fleet/{device_id}/maintenance")
def list_fleet_device_maintenance(
    session: SessionDep, _user: CurrentUser, device_id: uuid.UUID
) -> dict[str, Any]:
    row = get_device_row(session, device_id)
    items = [serialize_maintenance(item) for item in list_maintenance(session, row.id)]
    return {
        "data": items,
        "count": len(items),
        "summary": maintenance_summary(session, row.id),
    }


@router.post("/fleet/{device_id}/maintenance")
def create_fleet_device_maintenance(
    session: SessionDep,
    request: Request,
    user: SimAdmin,
    device_id: uuid.UUID,
    body: DeviceMaintenanceCreate,
) -> dict[str, Any]:
    row = get_device_row(session, device_id)
    payload = body.model_dump()
    if payload.get("status") == "in_progress":
        runtime_device = _runtime_by_code().get(row.code)
        if runtime_device and runtime_device.get("taskId"):
            raise HTTPException(
                status_code=409,
                detail="Оборудование выполняет задачу. Перевод в техническое обслуживание требует завершения или остановки текущей задачи",
            )
    record = create_maintenance(session, row, payload)
    if payload.get("status") == "in_progress":
        row = patch_fleet_device(session, row.id, {"inMaintenance": True})
        get_runtime().sync_fleet_device(row)
    log_audit(
        session,
        user_id=user.id,
        action="fleet.maintenance.create",
        resource_type="wsim_device",
        resource_id=row.id,
        details={"maintenance_id": str(record.id), "title": record.title},
        ip_address=get_client_ip(request),
    )
    session.commit()
    return serialize_maintenance(record)


@router.patch("/fleet/{device_id}/maintenance/{record_id}")
def patch_fleet_device_maintenance(
    session: SessionDep,
    request: Request,
    user: SimAdmin,
    device_id: uuid.UUID,
    record_id: uuid.UUID,
    body: DeviceMaintenancePatch,
) -> dict[str, Any]:
    row = get_device_row(session, device_id)
    record = get_maintenance(session, record_id)
    if record.device_id != row.id:
        raise HTTPException(status_code=404, detail="Запись ТО не найдена")
    patch = body.model_dump(exclude_unset=True)
    if patch.get("status") == "in_progress":
        runtime_device = _runtime_by_code().get(row.code)
        if runtime_device and runtime_device.get("taskId"):
            raise HTTPException(
                status_code=409,
                detail="Оборудование выполняет задачу. Перевод в техническое обслуживание требует завершения или остановки текущей задачи",
            )
    record = patch_maintenance(session, record_id, patch)
    if record.status == "in_progress":
        row = patch_fleet_device(session, row.id, {"inMaintenance": True})
        get_runtime().sync_fleet_device(row)
    elif record.status in ("completed", "cancelled"):
        open_items = [
            item
            for item in list_maintenance(session, row.id)
            if item.status == "in_progress"
        ]
        if not open_items:
            row = patch_fleet_device(session, row.id, {"inMaintenance": False})
            get_runtime().sync_fleet_device(row)
    log_audit(
        session,
        user_id=user.id,
        action="fleet.maintenance.update",
        resource_type="wsim_device",
        resource_id=row.id,
        details={"maintenance_id": str(record.id), "status": record.status},
        ip_address=get_client_ip(request),
    )
    session.commit()
    return serialize_maintenance(record)


@router.post("/devices/{device_id}/command")
def command_device(_user: SimAdmin, device_id: str, body: DeviceCommandBody) -> dict[str, Any]:
    try:
        return get_runtime().send_device_command(device_id, body.command, body.payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Устройство не найдено") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tasks")
def list_tasks(
    _user: CurrentUser,
    status: str | None = Query(default=None),
    device_id: str | None = Query(default=None),
) -> dict[str, Any]:
    tasks = get_runtime().world["tasks"]
    if status:
        tasks = [t for t in tasks if t["status"] == status]
    if device_id:
        tasks = [t for t in tasks if t.get("deviceId") == device_id]
    return {"data": tasks, "count": len(tasks)}


@router.get("/orders")
def list_orders(_user: CurrentUser) -> dict[str, Any]:
    world = get_runtime().world
    return {
        "inbound": world["inbound"][-40:],
        "outbound": world["outbound"][-60:],
        "trucks": world["trucks"],
    }


@router.get("/events")
def list_events(
    session: SessionDep,
    _user: CurrentUser,
    severity: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=128),
    device_id: str | None = Query(default=None),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=400),
    from_ts: datetime | None = Query(default=None),
    to_ts: datetime | None = Query(default=None),
) -> dict[str, Any]:
    return query_event_log(
        session,
        get_runtime(),
        severity=severity,
        event_type=event_type,
        q=q,
        device_id=device_id,
        skip=skip,
        limit=limit,
        from_ts=from_ts,
        to_ts=to_ts,
    )


@router.get("/catalog")
def read_catalog(_user: SimAdmin) -> dict[str, Any]:
    return {
        "event_types": list(ALL_EVENT_TYPES),
        "manual_event_types": list(MANUAL_EVENT_TYPES),
        "scenarios": SCENARIO_DEFS,
        "speeds": [0.5, 1, 2, 5, 10, 50],
        "device_commands": ["START", "STOP", "RESET", "MOVE", "CHARGE", "LOAD", "UNLOAD", "FAIL", "RECOVER"],
    }


@router.get("/scenarios")
def list_scenarios(_user: SimAdmin) -> dict[str, Any]:
    return {"data": SCENARIO_DEFS, "count": len(SCENARIO_DEFS)}


@router.post("/scenarios/apply")
def apply_scenario_route(_user: SimAdmin, body: ApplyScenarioBody) -> dict[str, Any]:
    try:
        return get_runtime().apply_scenario(body.code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Сценарий не найден") from exc


@router.post("/demo/start")
def start_demo(_user: SimAdmin) -> dict[str, Any]:
    return get_runtime().start_demo()


@router.post("/demo/reset")
def reset_demo(_user: SimAdmin) -> dict[str, Any]:
    return get_runtime().reset_demo()


@router.post("/control")
def control(_user: SimAdmin, body: SimControlBody) -> dict[str, Any]:
    rt = get_runtime()
    if body.action == "start":
        return rt.start()
    if body.action == "pause":
        return rt.pause()
    if body.action == "stop":
        return rt.stop()
    return rt.reset(body.config)


@router.post("/speed")
def set_speed(_user: SimAdmin, body: SimSpeedBody) -> dict[str, Any]:
    try:
        return get_runtime().set_speed(body.validated_speed())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/config")
def patch_config(_user: SimAdmin, body: SimConfigPatch) -> dict[str, Any]:
    patch = body.model_dump(exclude_none=True)
    return get_runtime().set_config(patch)


@router.post("/command")
def run_command(_user: SimAdmin, body: SimCommandBody) -> dict[str, Any]:
    return get_runtime().command(body.model_dump(exclude_none=True))


@router.post("/events")
def inject_event(_user: SimAdmin, body: ManualEventBody) -> dict[str, Any]:
    if body.event_type not in ALL_EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Неизвестный тип события")
    return get_runtime().inject_event(body.event_type, body.device_id, body.message)


@router.post("/fast-forward")
def fast_forward(_user: SimAdmin, body: FastForwardBody) -> dict[str, Any]:
    return get_runtime().fast_forward(body.seconds)


@router.get("/stream")
async def stream(_user: CurrentUser) -> StreamingResponse:
    rt = get_runtime()
    return StreamingResponse(
        sse_stream(rt),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
