"""Global search across items, equipment, work orders."""

from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import or_
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Item, WorkOrder
from app.warehouse_sim.models import SimDevice

router = APIRouter(prefix="/search", tags=["search"])

LIMIT = 5


@router.get("/")
def global_search(
    session: SessionDep,
    _current_user: CurrentUser,
    q: str = Query(..., min_length=2, max_length=100),
) -> dict[str, Any]:
    pattern = f"%{q}%"

    items_stmt = (
        select(Item)
        .where(
            or_(
                col(Item.title).ilike(pattern),
                col(Item.sku).ilike(pattern),
                col(Item.barcode).ilike(pattern),
            )
        )
        .limit(LIMIT)
    )
    items = [
        {"id": str(i.id), "title": i.title, "sku": i.sku}
        for i in session.exec(items_stmt).all()
    ]

    eq_stmt = (
        select(SimDevice)
        .where(
            SimDevice.archived.is_(False),
            or_(
                col(SimDevice.name).ilike(pattern),
                col(SimDevice.code).ilike(pattern),
            ),
        )
        .limit(LIMIT)
    )
    equipment = [
        {
            "id": str(e.id),
            "name": e.name,
            "serial_number": e.code,
        }
        for e in session.exec(eq_stmt).all()
    ]

    wo_stmt = (
        select(WorkOrder)
        .where(col(WorkOrder.title).ilike(pattern))
        .limit(LIMIT)
    )
    work_orders = [
        {"id": str(w.id), "title": w.title, "status": w.status}
        for w in session.exec(wo_stmt).all()
    ]

    return {"items": items, "equipment": equipment, "work_orders": work_orders}
