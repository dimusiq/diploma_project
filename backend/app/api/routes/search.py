"""Global search across items, equipment, work orders."""

from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import or_
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Brand, Equipment, Item, WorkOrder

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
        select(Equipment, Brand.name)
        .join(Brand, Equipment.brand_id == Brand.id)
        .where(
            or_(
                col(Equipment.model).ilike(pattern),
                col(Equipment.serial_number).ilike(pattern),
                col(Equipment.garage_number).ilike(pattern),
            )
        )
        .limit(LIMIT)
    )
    equipment = [
        {
            "id": str(e.id),
            "name": f"{brand_name} {e.model}",
            "serial_number": e.serial_number,
        }
        for e, brand_name in session.exec(eq_stmt).all()
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
