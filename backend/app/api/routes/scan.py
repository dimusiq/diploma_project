from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Category, Item

router = APIRouter(prefix="/scan", tags=["scan"])


@router.get("/")
def scan_lookup(
    session: SessionDep,
    _current_user: CurrentUser,
    code: str = Query(..., min_length=1, max_length=200),
) -> dict[str, Any]:
    """Look up an item by barcode or SKU."""
    stmt = select(Item).where(
        (col(Item.barcode) == code) | (col(Item.sku) == code)
    )
    item = session.exec(stmt).first()
    if not item:
        raise HTTPException(status_code=404, detail="Товар не найден")

    category = None
    if item.category_id:
        category = session.get(Category, item.category_id)

    return {
        "item": {
            "id": str(item.id),
            "title": item.title,
            "sku": item.sku,
            "barcode": item.barcode,
            "quantity": item.quantity,
            "status": item.status,
            "description": item.description,
            "unit": item.unit,
        },
        "location": {
            "category": category.name if category else None,
            "category_id": str(item.category_id) if item.category_id else None,
            "location": item.location,
            "storage_row": item.storage_row,
            "storage_level": item.storage_level,
            "storage_cell_x": item.storage_cell_x,
            "storage_cell_z": item.storage_cell_z,
        },
        "quick_actions": ["view_details", "adjust_quantity"],
    }
