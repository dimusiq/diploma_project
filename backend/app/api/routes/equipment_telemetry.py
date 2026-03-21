"""Телеметрия датчиков: чтение sensor_reading, приём новых показаний."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.permissions import PERM_WAREHOUSE_TELEMETRY_INGEST
from app.models import (
    SensorReading,
    SensorReadingCreate,
    SensorReadingList,
    SensorReadingPublic,
)

router = APIRouter(
    prefix="/warehouse/equipment/telemetry",
    tags=["equipment-telemetry"],
)


def _to_public(r: SensorReading) -> SensorReadingPublic:
    return SensorReadingPublic(
        id=r.id,
        warehouse_id=r.warehouse_id,
        sensor_code=r.sensor_code,
        metric_key=r.metric_key,
        read_at=r.read_at,
        value_float=r.value_float,
        value_text=r.value_text,
        position=r.position,
        raw=r.raw,
    )


@router.get("/readings", response_model=SensorReadingList)
def list_sensor_readings(
    session: SessionDep,
    _current_user: CurrentUser,
    warehouse_id: uuid.UUID | None = Query(default=None),
    sensor_code: str | None = Query(default=None, max_length=64),
    metric_key: str | None = Query(default=None, max_length=64),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> SensorReadingList:
    stmt = select(SensorReading)
    if warehouse_id is not None:
        stmt = stmt.where(SensorReading.warehouse_id == warehouse_id)
    if sensor_code is not None:
        stmt = stmt.where(SensorReading.sensor_code == sensor_code)
    if metric_key is not None:
        stmt = stmt.where(SensorReading.metric_key == metric_key)
    count_stmt = select(func.count()).select_from(SensorReading)
    if warehouse_id is not None:
        count_stmt = count_stmt.where(SensorReading.warehouse_id == warehouse_id)
    if sensor_code is not None:
        count_stmt = count_stmt.where(SensorReading.sensor_code == sensor_code)
    if metric_key is not None:
        count_stmt = count_stmt.where(SensorReading.metric_key == metric_key)
    count = session.exec(count_stmt).one()
    rows = list(
        session.exec(
            stmt.order_by(SensorReading.read_at.desc()).offset(skip).limit(limit)
        ).all()
    )
    return SensorReadingList(data=[_to_public(r) for r in rows], count=count)


@router.get("/readings/{reading_id}", response_model=SensorReadingPublic)
def get_sensor_reading(
    session: SessionDep,
    _current_user: CurrentUser,
    reading_id: uuid.UUID,
) -> SensorReadingPublic:
    row = session.get(SensorReading, reading_id)
    if not row:
        raise HTTPException(status_code=404, detail="Показание не найдено")
    return _to_public(row)


@router.post(
    "/readings",
    response_model=SensorReadingPublic,
    dependencies=[require_permission(PERM_WAREHOUSE_TELEMETRY_INGEST)],
)
def ingest_sensor_reading(
    session: SessionDep,
    _current_user: CurrentUser,
    body: SensorReadingCreate,
) -> SensorReadingPublic:
    read_at = body.read_at or datetime.now(timezone.utc)
    row = SensorReading(
        warehouse_id=body.warehouse_id,
        sensor_code=body.sensor_code,
        metric_key=body.metric_key,
        read_at=read_at,
        value_float=body.value_float,
        value_text=body.value_text,
        position=body.position,
        raw=body.raw,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_public(row)
