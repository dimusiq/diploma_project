"""Расчёт «следующего ТО» по моточасам (та же логика, что у API календаря)."""

from __future__ import annotations

import json
import math
import uuid

from sqlmodel import Session, select

from app.models import (
    ChainAssignment,
    Equipment,
    MaintenanceCalendarEventList,
    MaintenanceCalendarEventPublic,
    MaintenanceChain,
    MaintenanceChainStep,
    MaintenanceScheduleConfig,
)


def _get_default_config(session: Session) -> tuple[list[int], int]:
    default_intervals = [500, 1000, 1500, 2000, 2500]
    default_remind = 50

    intervals_row = session.get(MaintenanceScheduleConfig, "default_intervals")
    remind_row = session.get(MaintenanceScheduleConfig, "default_remind_before_hours")

    if intervals_row and intervals_row.value:
        try:
            parsed = json.loads(intervals_row.value)
            if isinstance(parsed, list) and parsed:
                default_intervals = [
                    int(x)
                    for x in parsed
                    if isinstance(x, int)
                    or (isinstance(x, float) and x.is_integer())
                ]
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


def _get_interval_and_remind_for_equipment(
    session: Session,
    *,
    equipment_id: uuid.UUID,
    default_interval: int,
    default_remind: int,
) -> tuple[int, uuid.UUID | None, int]:
    chain_ids_rows = session.exec(
        select(ChainAssignment.chain_id).where(ChainAssignment.equipment_id == equipment_id)
    ).all()
    chain_ids = [row for row in chain_ids_rows if row is not None]
    if not chain_ids:
        return default_interval, None, default_remind

    chains: list[MaintenanceChain] = []
    for cid in chain_ids:
        c = session.get(MaintenanceChain, cid)
        if c:
            chains.append(c)

    if not chains:
        return default_interval, None, default_remind

    chains_sorted = sorted(chains, key=lambda c: c.name)
    primary_chain = chains_sorted[0]
    remind_before = min(c.remind_before_hours for c in chains_sorted)

    first_step = session.exec(
        select(MaintenanceChainStep)
        .where(MaintenanceChainStep.chain_id == primary_chain.id)
        .order_by(MaintenanceChainStep.position)
        .limit(1)
    ).first()
    if first_step and first_step.interval_hours:
        return int(first_step.interval_hours), primary_chain.id, int(remind_before)

    return default_interval, primary_chain.id, int(remind_before)


def _compute_status(
    engine_hours: int, interval_hours: int, remind_before_hours: int
) -> tuple[str, int, int]:
    next_at = math.ceil(engine_hours / interval_hours) * interval_hours
    if engine_hours >= next_at:
        return "overdue", 0, next_at
    remaining = next_at - engine_hours
    if remaining <= remind_before_hours:
        return "due_soon", remaining, next_at
    return "ok", remaining, next_at


def build_maintenance_calendar_event_list(
    session: Session,
    *,
    status: str | None,
    limit: int,
) -> MaintenanceCalendarEventList:
    """
    Список событий календаря ТО (overdue | due_soon | ok), как в GET /maintenance-calendar-events.
    """
    if status is not None and status not in {"overdue", "due_soon", "ok"}:
        status = None

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

        interval_hours, primary_chain_id, remind_before = _get_interval_and_remind_for_equipment(
            session,
            equipment_id=eq.id,
            default_interval=default_interval,
            default_remind=default_remind,
        )
        if interval_hours <= 0:
            interval_hours = default_interval

        st, remaining, next_at = _compute_status(
            int(engine_hours), interval_hours, remind_before
        )
        if status is not None and st != status:
            continue

        event_uuid = uuid.uuid5(
            uuid.NAMESPACE_OID,
            f"{eq.id}-{primary_chain_id}-{interval_hours}-{next_at}",
        )

        eq_name = eq.garage_number or eq.model

        events.append(
            MaintenanceCalendarEventPublic(
                id=event_uuid,
                equipment_id=eq.id,
                equipment_name=eq_name,
                chain_id=primary_chain_id,
                interval_hours=interval_hours,
                engine_hours=int(engine_hours),
                next_service_at_hours=int(next_at),
                remaining_hours=int(remaining) if remaining is not None else None,
                status=st,
            )
        )

    events.sort(key=lambda e: (0 if e.status == "overdue" else 1, e.next_service_at_hours or 0))
    total_matching = len(events)
    if len(events) > limit:
        events = events[:limit]

    return MaintenanceCalendarEventList(
        data=events, count=len(events), total_matching=total_matching
    )
