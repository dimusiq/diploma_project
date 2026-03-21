"""Сохранённые сценарии симуляции и прогон по сохранённому config (blueprint /warehouse/simulations/*)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.api.routes.warehouse_simulation import (
    SimulationRunBody,
    SimulationRunResponse,
    _kpis_to_response,
)
from app.models import (
    SimulationScenario,
    SimulationScenarioCreate,
    SimulationScenarioList,
    SimulationScenarioPublic,
)
from app.simulation.des_engine import SimulationConfig, run_discrete_event_simulation

router = APIRouter(prefix="/warehouse/simulations", tags=["warehouse-simulations"])


def _scenario_public(s: SimulationScenario) -> SimulationScenarioPublic:
    return SimulationScenarioPublic(
        id=s.id,
        name=s.name,
        description=s.description,
        config=s.config,
        baseline_kpis=s.baseline_kpis,
        created_by_user_id=s.created_by_user_id,
        created_at=s.created_at,
    )


@router.get("/scenarios", response_model=SimulationScenarioList)
def list_simulation_scenarios(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> SimulationScenarioList:
    stmt = select(SimulationScenario).order_by(SimulationScenario.created_at.desc())
    if not current_user.is_superuser:
        stmt = stmt.where(SimulationScenario.created_by_user_id == current_user.id)
    count_stmt = select(func.count()).select_from(SimulationScenario)
    if not current_user.is_superuser:
        count_stmt = count_stmt.where(
            SimulationScenario.created_by_user_id == current_user.id
        )
    count = session.exec(count_stmt).one()
    rows = list(session.exec(stmt.offset(skip).limit(limit)).all())
    return SimulationScenarioList(data=[_scenario_public(r) for r in rows], count=count)


@router.post("/scenarios", response_model=SimulationScenarioPublic)
def create_simulation_scenario(
    session: SessionDep,
    current_user: CurrentUser,
    body: SimulationScenarioCreate,
) -> SimulationScenarioPublic:
    s = SimulationScenario(
        name=body.name,
        description=body.description,
        config=body.config,
        baseline_kpis=body.baseline_kpis,
        created_by_user_id=current_user.id,
    )
    session.add(s)
    session.commit()
    session.refresh(s)
    return _scenario_public(s)


@router.get("/scenarios/{scenario_id}", response_model=SimulationScenarioPublic)
def get_simulation_scenario(
    session: SessionDep,
    current_user: CurrentUser,
    scenario_id: uuid.UUID,
) -> SimulationScenarioPublic:
    s = session.get(SimulationScenario, scenario_id)
    if not s:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    if not current_user.is_superuser and s.created_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к сценарию")
    return _scenario_public(s)


class BaselinePatchBody(BaseModel):
    baseline_kpis: dict[str, Any] = Field(description="KPI снимок для сравнения прогонов")


@router.patch("/scenarios/{scenario_id}/baseline", response_model=SimulationScenarioPublic)
def patch_scenario_baseline(
    session: SessionDep,
    current_user: CurrentUser,
    scenario_id: uuid.UUID,
    body: BaselinePatchBody,
) -> SimulationScenarioPublic:
    s = session.get(SimulationScenario, scenario_id)
    if not s:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    if not current_user.is_superuser and s.created_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к сценарию")
    s.baseline_kpis = body.baseline_kpis
    session.add(s)
    session.commit()
    session.refresh(s)
    return _scenario_public(s)


@router.post("/scenarios/{scenario_id}/run", response_model=SimulationRunResponse)
def run_saved_simulation_scenario(
    session: SessionDep,
    current_user: CurrentUser,
    scenario_id: uuid.UUID,
) -> SimulationRunResponse:
    s = session.get(SimulationScenario, scenario_id)
    if not s:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    if not current_user.is_superuser and s.created_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к сценарию")
    try:
        body = SimulationRunBody.model_validate(s.config)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Некорректный config сценария: {e!s}",
        ) from e
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
    )
    result = run_discrete_event_simulation(cfg)
    return SimulationRunResponse(
        kpis=_kpis_to_response(result.kpis),
        horizon_minutes=result.horizon_minutes,
        event_trace_tail=result.event_trace_tail,
    )
