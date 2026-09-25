"""Симуляция склада (DES) и снимок KPI."""

from __future__ import annotations

import uuid
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.api.deps import CurrentUser, SessionDep
from app.models import User, Warehouse
from app.simulation.des_engine import (
    SimulationConfig,
    SimulationKpis,
    run_discrete_event_simulation,
)
from app.simulation.kpi_snapshot import build_kpi_snapshot
from app.simulation.twin_seed import (
    TwinSeedResolutionError,
    build_twin_initial_state_payload,
    initial_queues_from_twin_projections,
    resolve_simulation_warehouse_id,
)

router = APIRouter(prefix="/warehouse/simulation", tags=["warehouse-simulation"])

PutawayRuleApi = Literal["nearest", "round_robin", "random"]


class SimulationRunBody(BaseModel):
    duration_hours: float = Field(default=48.0, ge=1.0, le=8760.0)
    seed: int = 42
    dock_bays: int = Field(default=2, ge=1, le=32)
    num_forklifts: int = Field(default=3, ge=1, le=64)
    num_operators: int = Field(default=5, ge=1, le=256)
    truck_arrival_rate_per_hour: float = Field(default=3.5, ge=0.0, le=500.0)
    mean_dock_service_min: float = Field(default=22.0, ge=0.5, le=600.0)
    pick_orders_per_hour: float = Field(default=95.0, ge=0.0, le=5000.0)
    mean_pick_duration_min: float = Field(default=4.5, ge=0.3, le=240.0)
    mean_putaway_duration_min: float = Field(default=11.0, ge=0.5, le=240.0)
    replenishment_trips_per_hour: float = Field(default=8.0, ge=0.0, le=500.0)
    mean_replenishment_min: float = Field(default=18.0, ge=1.0, le=480.0)
    putaway_rule: PutawayRuleApi = "nearest"
    layout_travel_scale: float = Field(default=1.0, ge=0.25, le=4.0)
    sandbox_extra_putaway_min: float = Field(default=0.0, ge=0.0, le=120.0)
    seed_from_twin: bool = False
    warehouse_id: uuid.UUID | None = None


class SimulationKpisResponse(BaseModel):
    max_dock_queue: int
    max_putaway_queue: int
    max_pick_queue: int
    mean_dock_turnaround_min: float | None
    mean_inbound_dwell_min: float | None
    mean_pick_wait_min: float | None
    mean_pick_path_proxy_min: float | None
    mean_replenishment_cycle_min: float | None
    forklift_utilization: float
    operator_utilization: float
    dock_utilization: float
    otif_proxy: float
    late_pick_fraction: float
    events_processed: int


class SimulationRunResponse(BaseModel):
    kpis: SimulationKpisResponse
    horizon_minutes: float
    event_trace_tail: list[dict[str, Any]]
    twin_initial_state: dict[str, Any] | None = None


class WarehouseForSimulationSeed(BaseModel):
    id: uuid.UUID
    code: str
    name: str


def _kpis_to_response(k: SimulationKpis) -> SimulationKpisResponse:
    return SimulationKpisResponse(
        max_dock_queue=k.max_dock_queue,
        max_putaway_queue=k.max_putaway_queue,
        max_pick_queue=k.max_pick_queue,
        mean_dock_turnaround_min=k.mean_dock_turnaround_min,
        mean_inbound_dwell_min=k.mean_inbound_dwell_min,
        mean_pick_wait_min=k.mean_pick_wait_min,
        mean_pick_path_proxy_min=k.mean_pick_path_proxy_min,
        mean_replenishment_cycle_min=k.mean_replenishment_cycle_min,
        forklift_utilization=k.forklift_utilization,
        operator_utilization=k.operator_utilization,
        dock_utilization=k.dock_utilization,
        otif_proxy=k.otif_proxy,
        late_pick_fraction=k.late_pick_fraction,
        events_processed=k.events_processed,
    )


def simulation_config_from_run_body(
    session: Session,
    current_user: User,
    body: SimulationRunBody,
) -> tuple[SimulationConfig, dict[str, Any] | None]:
    twin_meta: dict[str, Any] | None = None
    idock = iput = ipick = 0
    if body.seed_from_twin:
        wid = resolve_simulation_warehouse_id(session, body.warehouse_id)
        idock, iput, ipick, qrows = initial_queues_from_twin_projections(session, wid)
        twin_meta = build_twin_initial_state_payload(
            session,
            current_user,
            wid,
            idock,
            iput,
            ipick,
            qrows,
        )
    cfg = SimulationConfig(
        duration_hours=body.duration_hours,
        seed=body.seed,
        dock_bays=body.dock_bays,
        num_forklifts=body.num_forklifts,
        num_operators=body.num_operators,
        truck_arrival_rate_per_hour=body.truck_arrival_rate_per_hour,
        mean_dock_service_min=body.mean_dock_service_min,
        pick_orders_per_hour=body.pick_orders_per_hour,
        mean_pick_duration_min=body.mean_pick_duration_min,
        mean_putaway_duration_min=body.mean_putaway_duration_min,
        replenishment_trips_per_hour=body.replenishment_trips_per_hour,
        mean_replenishment_min=body.mean_replenishment_min,
        putaway_rule=body.putaway_rule,
        layout_travel_scale=body.layout_travel_scale,
        sandbox_extra_putaway_min=body.sandbox_extra_putaway_min,
        initial_dock_queue=idock,
        initial_putaway_queue=iput,
        initial_pick_queue=ipick,
    )
    return cfg, twin_meta


def run_simulation_for_body(
    session: Session,
    current_user: User,
    body: SimulationRunBody,
) -> SimulationRunResponse:
    try:
        cfg, twin_meta = simulation_config_from_run_body(session, current_user, body)
    except TwinSeedResolutionError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e
    result = run_discrete_event_simulation(cfg)
    return SimulationRunResponse(
        kpis=_kpis_to_response(result.kpis),
        horizon_minutes=result.horizon_minutes,
        event_trace_tail=result.event_trace_tail,
        twin_initial_state=twin_meta,
    )


@router.get("/kpi-snapshot")
def read_kpi_snapshot(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    return build_kpi_snapshot(session, current_user)


@router.get("/warehouses-for-seed", response_model=list[WarehouseForSimulationSeed])
def list_warehouses_for_simulation_seed(
    session: SessionDep,
    _current_user: CurrentUser,
) -> list[WarehouseForSimulationSeed]:
    rows = list(session.exec(select(Warehouse).order_by(Warehouse.code)).all())
    return [
        WarehouseForSimulationSeed(id=w.id, code=w.code, name=w.name) for w in rows
    ]


@router.post("/run", response_model=SimulationRunResponse)
def run_simulation(
    session: SessionDep,
    current_user: CurrentUser,
    body: SimulationRunBody,
) -> Any:
    return run_simulation_for_body(session, current_user, body)
