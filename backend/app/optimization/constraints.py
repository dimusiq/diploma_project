"""Геометрия активного layout, занятость и допустимость целевой ячейки."""

from __future__ import annotations

import uuid

from sqlmodel import Session, col, select

from app.core.config import settings
from app.core.storage_slot import format_storage_slot_key, parse_storage_slot_key
from app.models import (
    RouteEdge,
    User,
    Warehouse,
    WarehouseLayout,
    WarehouseSlotOccupancy,
)
from app.optimization.schemas import GridSlot
from app.schemas.warehouse_layout_spec import (
    LayoutGeometryV1,
    parse_warehouse_layout_spec,
)


def active_geometry(session: Session, warehouse_id: uuid.UUID | None) -> LayoutGeometryV1:
    layout: WarehouseLayout | None = None
    if warehouse_id is not None:
        warehouse = session.get(Warehouse, warehouse_id)
        if warehouse is not None and warehouse.active_layout_id is not None:
            layout = session.get(WarehouseLayout, warehouse.active_layout_id)
        if layout is None:
            layout = session.exec(
                select(WarehouseLayout).where(
                    WarehouseLayout.warehouse_id == warehouse_id,
                    WarehouseLayout.is_active.is_(True),
                )
            ).first()
    if layout is None:
        layout = session.exec(
            select(WarehouseLayout).where(WarehouseLayout.is_active.is_(True))
        ).first()
    raw = layout.spec if layout is not None and isinstance(layout.spec, dict) else None
    return parse_warehouse_layout_spec(raw).geometry


def occupied_slot_keys(session: Session, user: User) -> set[str]:
    """Занятые ячейки проекции. Чужие товары в рекомендацию не попадают отдельно.

    Занятость читается целиком: иначе слоттинг предложит ячейку, которую нельзя
    занять, потому что её держит другой владелец.
    """
    del user
    stmt = select(WarehouseSlotOccupancy.slot_key)
    return {str(key) for key in session.exec(stmt).all()}


def iter_geometry_slot_keys(geometry: LayoutGeometryV1) -> list[str]:
    keys: list[str] = []
    for row in range(1, geometry.rows + 1):
        for level in range(1, geometry.levels + 1):
            for cell_x in range(1, geometry.cellX + 1):
                for cell_z in range(1, geometry.cellZ + 1):
                    key = format_storage_slot_key(row, level, cell_x, cell_z)
                    if key is not None:
                        keys.append(key)
    return keys


def eligible_slots(
    session: Session,
    warehouse_id: uuid.UUID | None,
    occupied: set[str],
) -> list[str]:
    geometry = active_geometry(session, warehouse_id)
    limit = max(0, int(settings.AI_SLOTTING_MAX_CANDIDATES))
    chosen: list[str] = []
    for key in iter_geometry_slot_keys(geometry):
        if key in occupied:
            continue
        chosen.append(key)
        if len(chosen) >= limit:
            break
    return chosen


def grid_slots_from_keys(slot_keys: list[str]) -> list[GridSlot]:
    slots: list[GridSlot] = []
    for key in slot_keys:
        parsed = parse_storage_slot_key(key)
        if parsed is None:
            continue
        row, level, cell_x, cell_z = parsed
        slots.append(
            GridSlot(
                slot_key=key,
                row=row,
                level=level,
                cell_x=cell_x,
                cell_z=cell_z,
            )
        )
    return slots


def mean_route_edge_weight(session: Session, warehouse_id: uuid.UUID | None) -> float | None:
    stmt = select(RouteEdge.weight).where(col(RouteEdge.weight).is_not(None))
    if warehouse_id is not None:
        stmt = stmt.where(RouteEdge.warehouse_id == warehouse_id)
    weights = [
        float(weight)
        for weight in session.exec(stmt).all()
        if weight is not None and float(weight) > 0
    ]
    if not weights:
        return None
    return sum(weights) / len(weights)


def slot_key_within_geometry(slot_key: str, geometry: LayoutGeometryV1) -> bool:
    parsed = parse_storage_slot_key(slot_key)
    if parsed is None:
        return False
    row, level, cell_x, cell_z = parsed
    return (
        1 <= row <= geometry.rows
        and 1 <= level <= geometry.levels
        and 1 <= cell_x <= geometry.cellX
        and 1 <= cell_z <= geometry.cellZ
    )


def validate_transfer_slot(
    session: Session,
    slot_key: str,
    item_id: str | None,
    warehouse_id: uuid.UUID | None,
) -> str | None:
    """Пустой slot_key сюда не передаётся. None — ячейка допустима."""
    parsed = parse_storage_slot_key(slot_key)
    if parsed is None:
        return "Некорректный slot_key"
    geometry = active_geometry(session, warehouse_id)
    if not slot_key_within_geometry(slot_key, geometry):
        return "slot_key вне границ активного layout"
    occupancy = session.exec(
        select(WarehouseSlotOccupancy).where(WarehouseSlotOccupancy.slot_key == slot_key)
    ).first()
    if occupancy is not None and (item_id is None or str(occupancy.item_id) != item_id):
        return "Целевая ячейка уже занята другим товаром"
    return None
