"""Подбор пар товар → slot_key. В БД не пишет."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, col, func, select

from app.core.config import settings
from app.core.permissions import can_see_all_items
from app.core.storage_slot import format_storage_slot_key
from app.models import Item, ItemHistory, User
from app.optimization.constraints import (
    active_geometry,
    eligible_slots,
    grid_slots_from_keys,
    mean_route_edge_weight,
    occupied_slot_keys,
)
from app.optimization.schemas import MovableItem, SlottingRecommendation
from app.optimization.scoring import classify_abc, optimize_slotting, velocity_weight
from app.simulation.twin_seed import (
    TwinSeedResolutionError,
    resolve_simulation_warehouse_id,
)

ABC_WINDOW_DAYS = 90


def resolve_slotting_warehouse_id(
    session: Session,
    warehouse_id: uuid.UUID | None,
) -> uuid.UUID | None:
    if warehouse_id is not None:
        return warehouse_id
    try:
        return resolve_simulation_warehouse_id(session, None)
    except TwinSeedResolutionError:
        return None


def _movement_counts(session: Session, item_ids: list[uuid.UUID]) -> dict[str, int]:
    counts = {str(item_id): 0 for item_id in item_ids}
    if not item_ids:
        return counts
    cutoff = datetime.now(timezone.utc) - timedelta(days=ABC_WINDOW_DAYS)
    stmt = (
        select(ItemHistory.item_id, func.count(ItemHistory.id))
        .where(col(ItemHistory.changed_at) >= cutoff)
        .where(col(ItemHistory.item_id).in_(item_ids))
        .group_by(ItemHistory.item_id)
    )
    for item_id, count in session.exec(stmt).all():
        counts[str(item_id)] = int(count)
    return counts


def _visible_warehouse_items(session: Session, user: User) -> list[Item]:
    stmt = select(Item).where(Item.status == "warehouse")
    if not can_see_all_items(session, user):
        stmt = stmt.where(Item.owner_id == user.id)
    return list(session.exec(stmt).all())


def recommend(
    session: Session,
    user: User,
    *,
    warehouse_id: uuid.UUID | None,
    seed: int,
    limit: int | None = None,
) -> SlottingRecommendation:
    top_k = max(1, int(settings.AI_SLOTTING_TOP_K))
    if limit is not None:
        top_k = max(1, min(int(limit), top_k))
    wid = resolve_slotting_warehouse_id(session, warehouse_id)
    items = _visible_warehouse_items(session, user)
    placed: list[Item] = []
    for item in items:
        if (
            item.storage_row is None
            or item.storage_level is None
            or item.storage_cell_x is None
            or item.storage_cell_z is None
        ):
            continue
        placed.append(item)
    counts = _movement_counts(session, [item.id for item in placed])
    classes = classify_abc(counts)
    movable = [
        MovableItem(
            item_id=str(item.id),
            current_slot_key=format_storage_slot_key(
                item.storage_row,
                item.storage_level,
                item.storage_cell_x,
                item.storage_cell_z,
            ),
            velocity=velocity_weight(classes.get(str(item.id), "C"), counts.get(str(item.id), 0)),
            row=int(item.storage_row or 1),
            level=int(item.storage_level or 1),
            cell_x=int(item.storage_cell_x or 1),
            cell_z=int(item.storage_cell_z or 1),
        )
        for item in placed
    ]
    geometry = active_geometry(session, wid)
    cells_per_row = max(1, geometry.levels * geometry.cellX * geometry.cellZ)
    row_counts: dict[int, int] = {}
    for item in placed:
        if item.storage_row is None:
            continue
        row_counts[int(item.storage_row)] = row_counts.get(int(item.storage_row), 0) + 1
    row_loads = {row: count / cells_per_row for row, count in row_counts.items()}
    occupied = occupied_slot_keys(session, user)
    slot_keys = eligible_slots(session, wid, occupied)
    return optimize_slotting(
        movable,
        grid_slots_from_keys(slot_keys),
        seed=int(seed),
        max_candidates=int(settings.AI_SLOTTING_MAX_CANDIDATES),
        top_k=top_k,
        min_improvement=float(settings.AI_SLOTTING_MIN_IMPROVEMENT),
        row_loads=row_loads,
        row_load_step=1.0 / cells_per_row,
        route_unit=mean_route_edge_weight(session, wid),
    )
