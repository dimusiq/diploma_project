"""HTTP API Warehouse Device Server — ROLE_ADMIN или суперпользователь."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.api.deps import SessionDep, get_current_warehouse_sim_admin
from app.models import User
from app.warehouse_sim.events import ALL_EVENT_TYPES, MANUAL_EVENT_TYPES
from app.warehouse_sim.runtime import get_runtime, query_event_log, sse_stream
from app.warehouse_sim.scenarios import SCENARIO_DEFS
from app.warehouse_sim.schemas import (
    ApplyScenarioBody,
    DeviceCommandBody,
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
def read_snapshot(_user: SimAdmin) -> dict[str, Any]:
    return get_runtime().data()


@router.get("/motion")
def read_motion(_user: SimAdmin) -> dict[str, Any]:
    return get_runtime().motion()


@router.get("/kpi")
def read_kpi(_user: SimAdmin) -> dict[str, Any]:
    data = get_runtime().data()
    return data.get("kpi") or {}


@router.get("/layout")
def read_layout(_user: SimAdmin) -> dict[str, Any]:
    return get_runtime().world["topology"]


@router.get("/devices")
def list_devices(_user: SimAdmin) -> dict[str, Any]:
    rt = get_runtime()
    return {"data": rt.devices.get_devices(), "count": len(rt.world["devices"])}


@router.get("/devices/{device_id}")
def read_device(_user: SimAdmin, device_id: str) -> dict[str, Any]:
    try:
        return get_runtime().devices.get_device_telemetry(device_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Устройство не найдено") from exc


@router.post("/devices/{device_id}/command")
def command_device(_user: SimAdmin, device_id: str, body: DeviceCommandBody) -> dict[str, Any]:
    try:
        return get_runtime().send_device_command(device_id, body.command, body.payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Устройство не найдено") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tasks")
def list_tasks(_user: SimAdmin, status: str | None = Query(default=None)) -> dict[str, Any]:
    tasks = get_runtime().world["tasks"]
    if status:
        tasks = [t for t in tasks if t["status"] == status]
    return {"data": tasks, "count": len(tasks)}


@router.get("/orders")
def list_orders(_user: SimAdmin) -> dict[str, Any]:
    world = get_runtime().world
    return {
        "inbound": world["inbound"][-40:],
        "outbound": world["outbound"][-60:],
        "trucks": world["trucks"],
    }


@router.get("/events")
def list_events(
    session: SessionDep,
    _user: SimAdmin,
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
async def stream(_user: SimAdmin) -> StreamingResponse:
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
