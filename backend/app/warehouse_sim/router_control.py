"""Админ-управление симуляцией: сценарии, demo, control, config, inject, FF."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.warehouse_sim.events import ALL_EVENT_TYPES, MANUAL_EVENT_TYPES
from app.warehouse_sim.router_common import SessionDep, SimAdmin, _audit_sim
from app.warehouse_sim.runtime import get_runtime
from app.warehouse_sim.scenarios import SCENARIO_DEFS
from app.warehouse_sim.schemas import (
    ApplyScenarioBody,
    FastForwardBody,
    ManualEventBody,
    SimCommandBody,
    SimConfigPatch,
    SimControlBody,
    SimSpeedBody,
)

router = APIRouter()


@router.get("/catalog")
def read_catalog(_user: SimAdmin) -> dict[str, Any]:
    return {
        "event_types": list(ALL_EVENT_TYPES),
        "manual_event_types": list(MANUAL_EVENT_TYPES),
        "scenarios": SCENARIO_DEFS,
        "speeds": [0.5, 1, 2, 5, 10, 50],
        "device_commands": [
            "START",
            "STOP",
            "RESET",
            "MOVE",
            "CHARGE",
            "LOAD",
            "UNLOAD",
            "FAIL",
            "RECOVER",
        ],
    }

@router.get("/scenarios")
def list_scenarios(_user: SimAdmin) -> dict[str, Any]:
    return {"data": SCENARIO_DEFS, "count": len(SCENARIO_DEFS)}

@router.post("/scenarios/apply")
def apply_scenario_route(
    session: SessionDep, request: Request, user: SimAdmin, body: ApplyScenarioBody
) -> dict[str, Any]:
    try:
        result = get_runtime().apply_scenario(body.code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Сценарий не найден") from exc
    _audit_sim(session, request, user, "simulation.scenario", {"code": body.code})
    return result

@router.post("/demo/start")
def start_demo(session: SessionDep, request: Request, user: SimAdmin) -> dict[str, Any]:
    result = get_runtime().start_demo()
    _audit_sim(session, request, user, "simulation.demo_start", {})
    return result

@router.post("/demo/reset")
def reset_demo(session: SessionDep, request: Request, user: SimAdmin) -> dict[str, Any]:
    result = get_runtime().reset_demo()
    _audit_sim(session, request, user, "simulation.demo_reset", {})
    return result

@router.post("/control")
def control(
    session: SessionDep, request: Request, user: SimAdmin, body: SimControlBody
) -> dict[str, Any]:
    rt = get_runtime()
    if body.action == "start":
        result = rt.start()
    elif body.action == "pause":
        result = rt.pause()
    elif body.action == "stop":
        result = rt.stop()
    else:
        result = rt.reset(body.config)
    _audit_sim(
        session, request, user, f"simulation.{body.action}", {"action": body.action}
    )
    return result

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
async def fast_forward(_user: SimAdmin, body: FastForwardBody) -> dict[str, Any]:
    """Чанкованный async fast-forward: не блокирует SSE на том же event loop."""
    return await get_runtime().fast_forward_async(body.seconds)

