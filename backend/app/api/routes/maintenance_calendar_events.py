"""Maintenance calendar events for draggable planning UI.

Эти события не содержат реального start/end по времени выполнения:
они представляют "следующее ТО" (по моточасам) и используются в календаре
как карточки, которые пользователь перетаскивает на конкретный тайм-слот.
"""

import json
import math
import uuid

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.core.permissions import can_view_maintenance_schedule
from app.models import (
    ChainAssignment,
    Equipment,
    MaintenanceCalendarEventList,
    MaintenanceCalendarEventPublic,
    MaintenanceChain,
    MaintenanceChainStep,
    MaintenanceScheduleConfig,
)

router = APIRouter(prefix="/maintenance-calendar-events", tags=["maintenance-calendar-events"])


def _get_default_config(session: SessionDep) -> tuple[list[int], int]:
    default_intervals = [500, 1000, 1500, 2000, 2500]
    default_remind = 50

    intervals_row = session.get(MaintenanceScheduleConfig, "default_intervals")
    remind_row = session.get(MaintenanceScheduleConfig, "default_remind_before_hours")

    if intervals_row and intervals_row.value:
        try:
            parsed = json.loads(intervals_row.value)
            if isinstance(parsed, list) and parsed:
                default_intervals = [int(x) for x in parsed if isinstance(x, int) or (isinstance(x, float) and x.is_integer())]
        except Exception:
            pass

    if remind_row and remind_row.value:
        try:
            default_remind = int(remind_row.value)
        except Exception:
            pass

    if not default_intervals:
        default_intervals = [500]

    return default_intervals, default_remind


def _interval_for_equipment(session: SessionDep, equipment_id: uuid.UUID, default_interval: int) -> tuple[int, uuid.UUID | None]:
    """Интервал ТО (м/ч) для техники: первый шаг цепочки или default."""
    assignment = session.exec(
        select(ChainAssignment).where(ChainAssignment.equipment_id == equipment_id).limit(1)
    ).first()
    if not assignment:
        return default_interval, None

    first_step = session.exec(
        select(MaintenanceChainStep)
        .where(MaintenanceChainStep.chain_id == assignment.chain_id)
        .order_by(MaintenanceChainStep.position)
        .limit(1)
    ).first()
    if first_step:
        return int(first_step.interval_hours), assignment.chain_id
    return default_interval, assignment.chain_id


def _remind_before_for_equipment(
    session: SessionDep, equipment_id: uuid.UUID
) -> uuid.UUID | None:
    """ID цепочки для техники (для remind_before) или None."""
    assignment = session.exec(
        select(ChainAssignment).where(ChainAssignment.equipment_id == equipment_id).limit(1)
    ).first()
    return assignment.chain_id if assignment else None


def _compute_status(engine_hours: int, interval_hours: int, remind_before_hours: int) -> tuple[str, int, int]:
    next_at = math.ceil(engine_hours / interval_hours) * interval_hours
    if engine_hours >= next_at:
        return "overdue", 0, next_at
    remaining = next_at - engine_hours
    if remaining <= remind_before_hours:
        return "due_soon", remaining, next_at
    return "ok", remaining, next_at


@router.get("", response_model=MaintenanceCalendarEventList)
def list_maintenance_calendar_events(
    session: SessionDep,
    current_user: CurrentUser,
    status: str | None = Query(None, description="Фильтр: overdue | due_soon | ok"),
    limit: int = Query(100, ge=1, le=500),
) -> MaintenanceCalendarEventList:
    if status is not None and status not in {"overdue", "due_soon", "ok"}:
        raise HTTPException(status_code=400, detail="Недопустимый статус")
    if not can_view_maintenance_schedule(session, current_user):
        raise HTTPException(status_code=403, detail="Недостаточно прав для просмотра")

    default_intervals, default_remind = _get_default_config(session)
    default_interval = default_intervals[0] if default_intervals else 500

    equipments = list(
        session.exec(select(Equipment).where(Equipment.engine_hours.is_not(None))).all()
    )

    events: list[MaintenanceCalendarEventPublic] = []
    for eq in equipments:
        engine_hours = eq.engine_hours
        if engine_hours is None:
            continue

        interval_hours, chain_id = _interval_for_equipment(session, eq.id, default_interval)
        if interval_hours <= 0:
            interval_hours = default_interval

        chain_id_for_remind = _remind_before_for_equipment(session, eq.id)
        if chain_id_for_remind is None:
            remind_before = default_remind
        else:
            chain = session.get(MaintenanceChain, chain_id_for_remind)
            remind_before = chain.remind_before_hours if chain else default_remind

        st, remaining, next_at = _compute_status(int(engine_hours), interval_hours, remind_before)
        if status is not None and st != status:
            continue

        event_uuid = uuid.uuid5(
            uuid.NAMESPACE_OID,
            f"{eq.id}-{chain_id}-{interval_hours}-{next_at}",
        )

        eq_name = eq.garage_number or eq.model

        events.append(
            MaintenanceCalendarEventPublic(
                id=event_uuid,
                equipment_id=eq.id,
                equipment_name=eq_name,
                chain_id=chain_id,
                interval_hours=interval_hours,
                engine_hours=int(engine_hours),
                next_service_at_hours=int(next_at),
                remaining_hours=int(remaining) if remaining is not None else None,
                status=st,
            )
        )

    events.sort(key=lambda e: (0 if e.status == "overdue" else 1, e.next_service_at_hours or 0))
    if len(events) > limit:
        events = events[:limit]

    return MaintenanceCalendarEventList(data=events, count=len(events))

