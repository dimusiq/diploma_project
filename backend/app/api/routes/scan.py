from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, SessionDep
from app.models import Category, OutboundOrder
from app.services.outbound_ops import confirm_pick, lookup_item_by_code

router = APIRouter(prefix="/scan", tags=["scan"])


class ScanConfirmPickBody(BaseModel):
    """Подтверждение отбора сканом (тот же код, что в GET /scan/)."""

    order_id: UUID
    task_id: UUID
    code: str = Field(min_length=1, max_length=200)
    outcome: str = Field(default="ok", max_length=32)
    scanned_slot_key: str | None = Field(default=None, max_length=128)
    quantity: int | None = Field(default=None, ge=1)
    reason: str | None = Field(default=None, max_length=512)


@router.get("/")
def scan_lookup(
    session: SessionDep,
    _current_user: CurrentUser,
    code: str = Query(..., min_length=1, max_length=200),
) -> dict[str, Any]:
    """Поиск товара по штрихкоду или SKU."""
    item = lookup_item_by_code(session, code)
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
        "quick_actions": [
            "view_details",
            "adjust_quantity",
            "confirm_pick",
        ],
    }


@router.post("/confirm-pick")
def scan_confirm_pick(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    body: ScanConfirmPickBody,
) -> dict[str, Any]:
    """Подтвердить задание отбора отсканированным кодом."""
    order = session.get(OutboundOrder, body.order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Исходящий заказ не найден")
    try:
        result = confirm_pick(
            session,
            order,
            task_id=body.task_id,
            actor_user_id=current_user.id,
            outcome=body.outcome,
            scanned_code=body.code,
            scanned_slot_key=body.scanned_slot_key,
            quantity=body.quantity,
            reason=body.reason,
        )
        session.commit()
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise
    session.refresh(order)
    return {
        "order_id": str(order.id),
        "order_status": order.status,
        **result,
    }
