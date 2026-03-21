"""REST API складских заданий (WMS task domain)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.permissions import PERM_WAREHOUSE_TASKS_MANAGE, PERM_WAREHOUSE_TASKS_READ
from app.models import (
    Warehouse,
    WarehouseTask,
    WarehouseTaskCreate,
    WarehouseTaskList,
    WarehouseTaskPatch,
    WarehouseTaskPublic,
)

router = APIRouter(prefix="/warehouse/tasks", tags=["warehouse-tasks"])


def _default_warehouse_id(session: SessionDep) -> uuid.UUID:
    wh = session.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if wh:
        return wh.id
    wh = session.exec(select(Warehouse).order_by(Warehouse.created_at)).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Склад не настроен")
    return wh.id


def _to_public(t: WarehouseTask) -> WarehouseTaskPublic:
    return WarehouseTaskPublic(
        id=t.id,
        warehouse_id=t.warehouse_id,
        task_type=t.task_type,
        status=t.status,
        priority=t.priority,
        assigned_user_id=t.assigned_user_id,
        handling_unit_id=t.handling_unit_id,
        storage_bin_id=t.storage_bin_id,
        payload=t.payload,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


@router.get(
    "",
    response_model=WarehouseTaskList,
    dependencies=[require_permission(PERM_WAREHOUSE_TASKS_READ)],
)
def list_warehouse_tasks(
    session: SessionDep,
    _current_user: CurrentUser,
    warehouse_id: uuid.UUID | None = Query(default=None),
    status: str | None = Query(default=None, max_length=32),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    wid = warehouse_id or _default_warehouse_id(session)
    stmt = select(WarehouseTask).where(WarehouseTask.warehouse_id == wid)
    if status is not None:
        stmt = stmt.where(WarehouseTask.status == status)
    count_stmt = select(func.count()).select_from(WarehouseTask).where(
        WarehouseTask.warehouse_id == wid
    )
    if status is not None:
        count_stmt = count_stmt.where(WarehouseTask.status == status)
    count = session.exec(count_stmt).one()
    rows = list(
        session.exec(
            stmt.order_by(WarehouseTask.priority.desc(), WarehouseTask.updated_at.desc())
            .offset(skip)
            .limit(limit)
        ).all()
    )
    return WarehouseTaskList(data=[_to_public(r) for r in rows], count=count)


@router.get(
    "/{task_id}",
    response_model=WarehouseTaskPublic,
    dependencies=[require_permission(PERM_WAREHOUSE_TASKS_READ)],
)
def get_warehouse_task(
    session: SessionDep,
    _current_user: CurrentUser,
    task_id: uuid.UUID,
):
    t = session.get(WarehouseTask, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    return _to_public(t)


@router.post(
    "",
    response_model=WarehouseTaskPublic,
    dependencies=[require_permission(PERM_WAREHOUSE_TASKS_MANAGE)],
)
def create_warehouse_task(
    session: SessionDep,
    _current_user: CurrentUser,
    body: WarehouseTaskCreate,
):
    wid = body.warehouse_id or _default_warehouse_id(session)
    now = datetime.now(timezone.utc)
    t = WarehouseTask(
        warehouse_id=wid,
        task_type=body.task_type,
        status=body.status or "pending",
        priority=body.priority,
        assigned_user_id=body.assigned_user_id,
        handling_unit_id=body.handling_unit_id,
        storage_bin_id=body.storage_bin_id,
        payload=body.payload,
        created_at=now,
        updated_at=now,
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    return _to_public(t)


@router.patch(
    "/{task_id}",
    response_model=WarehouseTaskPublic,
    dependencies=[require_permission(PERM_WAREHOUSE_TASKS_MANAGE)],
)
def patch_warehouse_task(
    session: SessionDep,
    _current_user: CurrentUser,
    task_id: uuid.UUID,
    body: WarehouseTaskPatch,
):
    t = session.get(WarehouseTask, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    if body.status is not None:
        t.status = body.status
    if body.priority is not None:
        t.priority = body.priority
    if body.assigned_user_id is not None:
        t.assigned_user_id = body.assigned_user_id
    if body.payload is not None:
        t.payload = body.payload
    t.updated_at = datetime.now(timezone.utc)
    session.add(t)
    session.commit()
    session.refresh(t)
    return _to_public(t)
