"""Live-чтение симуляции: snapshot / devices / tasks / orders / events / SSE."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.warehouse_sim.router_common import CurrentUser, SessionDep, SimAdmin
from app.warehouse_sim.runtime import get_runtime, query_event_log, sse_stream
from app.warehouse_sim.schemas import DeviceCommandBody

router = APIRouter()


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
    topology = get_runtime().view_layout()
    if not isinstance(topology, dict):
        return {}
    return topology


@router.get("/devices")
def list_devices(_user: CurrentUser) -> dict[str, Any]:
    return get_runtime().view_devices_list()


@router.get("/devices/{device_id}")
def read_device(_user: CurrentUser, device_id: str) -> dict[str, Any]:
    try:
        return get_runtime().view_device_telemetry(device_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Устройство не найдено") from exc


@router.post("/devices/{device_id}/command")
def command_device(
    _user: SimAdmin, device_id: str, body: DeviceCommandBody
) -> dict[str, Any]:
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
    return get_runtime().view_tasks(status=status, device_id=device_id)


@router.get("/orders")
def list_orders(_user: CurrentUser) -> dict[str, Any]:
    return get_runtime().view_orders()


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


@router.get("/stream")
async def stream(
    _user: CurrentUser,
    deltas: bool = Query(
        default=False,
        description="true — дельта-протокол (первый кадр full, далее mode=delta)",
    ),
    since: int | None = Query(
        default=None,
        ge=0,
        description="Ревизия клиента; при deltas=1 и since>=текущей — без начального full",
    ),
) -> StreamingResponse:
    rt = get_runtime()
    return StreamingResponse(
        sse_stream(rt, deltas=deltas, since=since),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
