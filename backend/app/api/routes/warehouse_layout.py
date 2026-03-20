"""Активная геометрия склада для 3D twin и валидации координат."""

from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.core.permissions import can_see_all_items
from app.models import (
    WarehouseLayout,
    WarehouseLayoutPublic,
    WarehouseOccupancyResponse,
    WarehouseSlotOccupancy,
    WarehouseSlotOccupancyEntry,
)

router = APIRouter(prefix="/warehouse", tags=["warehouse"])


@router.get("/layout", response_model=WarehouseLayoutPublic)
def read_active_warehouse_layout(session: SessionDep, _current_user: CurrentUser) -> Any:
    """Текущий активный layout (spec задаёт rows/levels/cellX/cellZ и соглашения)."""
    row = session.exec(select(WarehouseLayout).where(WarehouseLayout.is_active.is_(True))).first()
    if not row:
        raise HTTPException(status_code=404, detail="Активная конфигурация склада не найдена")
    return WarehouseLayoutPublic.model_validate(row)


@router.get("/occupancy", response_model=WarehouseOccupancyResponse)
def read_warehouse_occupancy(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Проекция занятости ячеек (slot_key → item_id): легковесный ответ для twin/KPI.
    Без items.read_all — только ячейки товаров текущего пользователя.
    """
    stmt = select(WarehouseSlotOccupancy)
    if not can_see_all_items(session, current_user):
        stmt = stmt.where(WarehouseSlotOccupancy.owner_id == current_user.id)
    rows = list(session.exec(stmt).all())
    return WarehouseOccupancyResponse(
        data=[
            WarehouseSlotOccupancyEntry(slot_key=r.slot_key, item_id=r.item_id) for r in rows
        ],
        count=len(rows),
    )
