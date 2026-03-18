"""Work order scheduling conflicts (overlap checks).

Ключевая идея: у `WorkOrder` появляются временные окна `start_at/end_at`,
и мы блокируем создание/обновление заявки, если она пересекается по времени:
- по одной технике (`equipment_id`)
- и/или по одному исполнителю (`assigned_to_id`)
для активных статусов заявок.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, TypedDict

from sqlmodel import select
import json

from app.api.deps import SessionDep
from app.models import (
    WORK_ORDER_STATUS_IN_PROGRESS,
    WORK_ORDER_STATUS_OPEN,
    WORK_ORDER_STATUS_WAITING_PARTS,
    WorkOrder,
)


BLOCKING_STATUSES = {WORK_ORDER_STATUS_OPEN, WORK_ORDER_STATUS_IN_PROGRESS, WORK_ORDER_STATUS_WAITING_PARTS}


class ConflictResult(TypedDict):
    equipment_conflicts: list[WorkOrder]
    assigned_to_conflicts: list[WorkOrder]


def _brief(wo: WorkOrder) -> dict[str, Any]:
    return {
        "id": str(wo.id),
        "title": wo.title,
        "equipment_id": str(wo.equipment_id),
        "assigned_to_id": str(wo.assigned_to_id) if wo.assigned_to_id else None,
        "status": wo.status,
        "start_at": wo.start_at,
        "end_at": wo.end_at,
    }


def find_overlapping_conflicts(
    session: SessionDep,
    *,
    equipment_id: uuid.UUID,
    assigned_to_id: uuid.UUID | None,
    start_at: datetime | None,
    end_at: datetime | None,
    exclude_work_order_id: uuid.UUID | None = None,
) -> ConflictResult:
    """Найти конфликтующие активные заявки по overlap."""
    if start_at is None or end_at is None:
        return {"equipment_conflicts": [], "assigned_to_conflicts": []}

    # Нулевое/некорректное окно - считаем что overlap не применим.
    if end_at <= start_at:
        return {"equipment_conflicts": [], "assigned_to_conflicts": []}

    equipment_stmt = select(WorkOrder).where(
        WorkOrder.equipment_id == equipment_id,
        WorkOrder.status.in_(BLOCKING_STATUSES),
        WorkOrder.start_at.is_not(None),
        WorkOrder.end_at.is_not(None),
        # overlap: existing.start < new.end AND existing.end > new.start
        WorkOrder.start_at < end_at,
        WorkOrder.end_at > start_at,
    )
    if exclude_work_order_id is not None:
        equipment_stmt = equipment_stmt.where(WorkOrder.id != exclude_work_order_id)

    equipment_conflicts = list(session.exec(equipment_stmt).all())

    assigned_to_conflicts: list[WorkOrder] = []
    if assigned_to_id is not None:
        assigned_stmt = select(WorkOrder).where(
            WorkOrder.assigned_to_id == assigned_to_id,
            WorkOrder.status.in_(BLOCKING_STATUSES),
            WorkOrder.start_at.is_not(None),
            WorkOrder.end_at.is_not(None),
            WorkOrder.start_at < end_at,
            WorkOrder.end_at > start_at,
        )
        if exclude_work_order_id is not None:
            assigned_stmt = assigned_stmt.where(WorkOrder.id != exclude_work_order_id)

        assigned_to_conflicts = list(session.exec(assigned_stmt).all())

    return {
        "equipment_conflicts": equipment_conflicts,
        "assigned_to_conflicts": assigned_to_conflicts,
    }


def assert_no_overlapping_conflicts_or_raise(
    session: SessionDep,
    *,
    equipment_id: uuid.UUID,
    assigned_to_id: uuid.UUID | None,
    start_at: datetime | None,
    end_at: datetime | None,
    exclude_work_order_id: uuid.UUID | None = None,
) -> None:
    """Бросает HTTPException 409 при конфликте overlap."""
    conflicts = find_overlapping_conflicts(
        session,
        equipment_id=equipment_id,
        assigned_to_id=assigned_to_id,
        start_at=start_at,
        end_at=end_at,
        exclude_work_order_id=exclude_work_order_id,
    )
    equipment_conflicts = conflicts["equipment_conflicts"]
    assigned_to_conflicts = conflicts["assigned_to_conflicts"]

    if not equipment_conflicts and not assigned_to_conflicts:
        return

    # Импортировать здесь, чтобы не тянуть fastapi во всём модуле.
    from fastapi import HTTPException

    payload = {
        "type": "schedule_conflict",
        "equipment_conflicts": [_brief(wo) for wo in equipment_conflicts],
        "assigned_to_conflicts": [_brief(wo) for wo in assigned_to_conflicts],
    }
    detail_str = json.dumps(payload, ensure_ascii=False)
    raise HTTPException(
        status_code=409,
        detail=detail_str,
    )

