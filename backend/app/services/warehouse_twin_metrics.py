"""Расчёт метрик цифрового двойника (общий код для API и уведомлений)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, col, func, select

from app.core.permissions import can_read_audit, can_see_all_items
from app.models import DomainEvent, Item, User, WarehouseLayout, WarehouseSlotOccupancy
from app.schemas.warehouse_layout_spec import (
    layout_capacity_cells,
    try_parse_warehouse_layout_spec,
)


def build_twin_summary_dict(session: Session, user: User) -> dict:
    """Словарь полей для ответа TwinSummaryResponse (без циклических импортов роутов)."""
    see_all = can_see_all_items(session, user)
    show_events = can_read_audit(session, user)

    if show_events:
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        ev_stmt = (
            select(DomainEvent.event_type, func.count())  # type: ignore[arg-type]
            .where(DomainEvent.occurred_at >= cutoff)
            .group_by(DomainEvent.event_type)
        )
        ev_rows = session.exec(ev_stmt).all()
        events_by_type = {str(et): int(n) for et, n in ev_rows}
    else:
        events_by_type = {}

    row_stmt = (
        select(Item.storage_row, func.count())
        .where(Item.status == "warehouse")
        .where(col(Item.storage_row).is_not(None))
    )
    if not see_all:
        row_stmt = row_stmt.where(Item.owner_id == user.id)
    row_stmt = row_stmt.group_by(Item.storage_row).order_by(Item.storage_row)
    row_rows = session.exec(row_stmt).all()
    by_row = [
        {"storage_row": int(r), "item_count": int(n)}
        for r, n in row_rows
        if r is not None
    ]

    total_stmt = select(func.count()).select_from(Item).where(Item.status == "warehouse")
    if not see_all:
        total_stmt = total_stmt.where(Item.owner_id == user.id)
    warehouse_total = session.exec(total_stmt).one()

    today = date.today()
    horizon = today + timedelta(days=30)
    exp_stmt = (
        select(func.count())
        .select_from(Item)
        .where(col(Item.expires_at).is_not(None))
        .where(col(Item.expires_at) >= today)
        .where(col(Item.expires_at) <= horizon)
    )
    if not see_all:
        exp_stmt = exp_stmt.where(Item.owner_id == user.id)
    expiring = session.exec(exp_stmt).one()

    layout = session.exec(
        select(WarehouseLayout).where(WarehouseLayout.is_active.is_(True))
    ).first()
    capacity: int | None = None
    if layout and isinstance(layout.spec, dict):
        p = try_parse_warehouse_layout_spec(layout.spec)
        if p is not None:
            try:
                capacity = layout_capacity_cells(p)
            except (TypeError, ValueError):
                capacity = None
        else:
            spec = layout.spec
            try:
                rows_n = int(spec.get("rows") or 0)
                levels = int(spec.get("levels") or 0)
                cx = int(spec.get("cellX") or 0)
                cz = int(spec.get("cellZ") or 0)
                if rows_n > 0 and levels > 0 and cx > 0 and cz > 0:
                    capacity = rows_n * levels * cx * cz
            except (TypeError, ValueError):
                capacity = None

    occ_stmt = select(func.count()).select_from(WarehouseSlotOccupancy)
    if not see_all:
        occ_stmt = occ_stmt.where(WarehouseSlotOccupancy.owner_id == user.id)
    occupied = session.exec(occ_stmt).one()

    ratio: float | None = None
    if capacity and capacity > 0:
        ratio = round(int(occupied) / capacity, 4)

    return {
        "domain_events_by_type": events_by_type,
        "warehouse_items_by_row": by_row,
        "warehouse_items_total": int(warehouse_total),
        "items_expiring_within_30_days": int(expiring),
        "layout_capacity_cells": capacity,
        "occupied_slots": int(occupied),
        "slot_utilization_ratio": ratio,
    }
