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
    run_simulation_for_body,
)
from app.models import (
    SimulationScenario,
    SimulationScenarioCreate,
    SimulationScenarioList,
    SimulationScenarioPublic,
)

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
    seed_from_twin: bool = Query(
        default=False,
        description="Добавить к прогону стартовые очереди из проекций twin",
    ),
    warehouse_id: uuid.UUID | None = Query(
        default=None,
        description="Склад для чтения очередей twin (иначе — первый склад в системе)",
    ),
) -> SimulationRunResponse:
    s = session.get(SimulationScenario, scenario_id)
    if not s:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    if not current_user.is_superuser and s.created_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к сценарию")
    merged = dict(s.config)
    if seed_from_twin:
        merged["seed_from_twin"] = True
    if warehouse_id is not None:
        merged["warehouse_id"] = str(warehouse_id)
    try:
        body = SimulationRunBody.model_validate(merged)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Некорректный config сценария: {e!s}",
        ) from e
    return run_simulation_for_body(session, current_user, body)
