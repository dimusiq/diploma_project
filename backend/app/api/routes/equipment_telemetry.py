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
    VehiclePosition,
    VehiclePositionCreate,
    VehiclePositionPublic,
)
from app.realtime.twin_stream_hub import (
    publish_equipment_position_sample,
    publish_external_vehicle_pose,
    publish_telemetry_fact,
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
    publish_telemetry_fact(
        event_type="sensor_reading",
        payload={
            "reading_id": str(row.id),
            "warehouse_id": str(row.warehouse_id) if row.warehouse_id else None,
            "sensor_code": row.sensor_code,
            "metric_key": row.metric_key,
            "read_at": row.read_at.isoformat().replace("+00:00", "Z"),
            "value_float": row.value_float,
            "value_text": row.value_text,
        },
    )
    return _to_public(row)


def _vehicle_to_public(r: VehiclePosition) -> VehiclePositionPublic:
    return VehiclePositionPublic(
        id=r.id,
        warehouse_id=r.warehouse_id,
        equipment_id=r.equipment_id,
        external_vehicle_id=r.external_vehicle_id,
        recorded_at=r.recorded_at,
        pose=r.pose,
        source=r.source,
        extra=r.extra,
    )


@router.post(
    "/vehicle-positions",
    response_model=VehiclePositionPublic,
    dependencies=[require_permission(PERM_WAREHOUSE_TELEMETRY_INGEST)],
)
def ingest_vehicle_position(
    session: SessionDep,
    _current_user: CurrentUser,
    body: VehiclePositionCreate,
) -> VehiclePositionPublic:
    if body.equipment_id is None and not (body.external_vehicle_id or "").strip():
        raise HTTPException(
            status_code=422,
            detail="Нужен equipment_id или external_vehicle_id",
        )
    recorded = body.recorded_at or datetime.now(timezone.utc)
    row = VehiclePosition(
        warehouse_id=body.warehouse_id,
        equipment_id=body.equipment_id,
        external_vehicle_id=body.external_vehicle_id,
        recorded_at=recorded,
        pose=body.pose or {},
        source=body.source,
        extra=body.extra,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    pl = {
        "vehicle_position_id": str(row.id),
        "warehouse_id": str(row.warehouse_id) if row.warehouse_id else None,
        "equipment_id": str(row.equipment_id) if row.equipment_id else None,
        "external_vehicle_id": row.external_vehicle_id,
        "recorded_at": row.recorded_at.isoformat().replace("+00:00", "Z"),
        "pose": row.pose,
        "source": row.source,
    }
    if row.equipment_id is not None:
        publish_equipment_position_sample(
            equipment_id=row.equipment_id,
            payload=pl,
        )
    else:
        publish_external_vehicle_pose(payload=pl)
    return _vehicle_to_public(row)
