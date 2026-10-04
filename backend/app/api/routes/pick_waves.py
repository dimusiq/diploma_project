"""API волн отбора (волновой / зонный picking)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    PickWave,
    PickWaveCreate,
    PickWaveList,
    PickWavePlanResult,
    PickWavePublic,
    PickWaveZoneAssignRequest,
)
from app.services.outbound_wave import (
    assign_zones,
    create_wave,
    plan_wave,
    wave_to_public,
)

router = APIRouter(prefix="/pick-waves", tags=["pick-waves"])


def _public(session: SessionDep, wave: PickWave) -> PickWavePublic:
    return PickWavePublic.model_validate(wave_to_public(session, wave))


@router.get("/", response_model=PickWaveList)
def list_pick_waves(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    status: str | None = None,
    warehouse_id: uuid.UUID | None = None,
) -> Any:
    stmt = select(PickWave)
    count_stmt = select(func.count()).select_from(PickWave)
    if status:
        stmt = stmt.where(PickWave.status == status)
        count_stmt = count_stmt.where(PickWave.status == status)
    if warehouse_id is not None:
        stmt = stmt.where(PickWave.warehouse_id == warehouse_id)
        count_stmt = count_stmt.where(PickWave.warehouse_id == warehouse_id)
    total = int(session.exec(count_stmt).one())
    rows = list(
        session.exec(
            stmt.order_by(col(PickWave.created_at).desc()).offset(skip).limit(limit)
        ).all()
    )
    return PickWaveList(data=[_public(session, w) for w in rows], count=total)


@router.get("/{wave_id}", response_model=PickWavePublic)
def get_pick_wave(
    session: SessionDep,
    _current_user: CurrentUser,
    wave_id: uuid.UUID,
) -> Any:
    wave = session.get(PickWave, wave_id)
    if not wave:
        raise HTTPException(status_code=404, detail="Волна не найдена")
    return _public(session, wave)


@router.post("/", response_model=PickWavePublic)
def create_pick_wave(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    body: PickWaveCreate,
) -> Any:
    try:
        wave = create_wave(
            session,
            warehouse_id=body.warehouse_id,
            order_ids=body.order_ids,
            mode=body.mode,
            code=body.code,
            criteria=body.criteria,
        )
        session.commit()
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise
    session.refresh(wave)
    return _public(session, wave)


@router.post("/{wave_id}/plan", response_model=PickWavePlanResult)
def plan_pick_wave(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    wave_id: uuid.UUID,
) -> Any:
    wave = session.get(PickWave, wave_id)
    if not wave:
        raise HTTPException(status_code=404, detail="Волна не найдена")
    try:
        stats = plan_wave(session, wave)
        session.commit()
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise
    session.refresh(wave)
    return PickWavePlanResult(
        wave=_public(session, wave),
        created_tasks=int(stats["created_tasks"]),
        route_length_m=float(stats["route_length_m"]),
        route_length_per_order_m=float(stats["route_length_per_order_m"]),
        savings_m=float(stats["savings_m"]),
    )


@router.post("/{wave_id}/assign-zones", response_model=PickWavePublic)
def assign_pick_wave_zones(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    wave_id: uuid.UUID,
    body: PickWaveZoneAssignRequest,
) -> Any:
    wave = session.get(PickWave, wave_id)
    if not wave:
        raise HTTPException(status_code=404, detail="Волна не найдена")
    try:
        assign_zones(
            session,
            wave,
            [a.model_dump() for a in body.assignments],
        )
        session.commit()
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise
    session.refresh(wave)
    return _public(session, wave)
