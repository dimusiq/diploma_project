"""API склада запчастей (отдельная сущность, не Item)."""
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import or_
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    SparePart,
    SparePartCreate,
    SparePartsPublic,
    SparePartPublic,
    SparePartUpdate,
)

router = APIRouter(prefix="/spare-parts", tags=["spare-parts"])


@router.get("/", response_model=SparePartsPublic)
def list_spare_parts(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: str | None = None,
    below_min: bool = Query(False, description="Только позиции с остатком <= min_quantity (алерты)"),
    sort_by: str | None = None,
    sort_order: str | None = None,
) -> Any:
    """Список запчастей. Фильтр below_min — только с алертом по минимальному остатку."""
    statement = select(SparePart)
    count_statement = select(func.count()).select_from(SparePart)

    if search and search.strip():
        q = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                SparePart.title.ilike(q),
                SparePart.sku.ilike(q),
                SparePart.description.ilike(q),
            )
        )
        count_statement = count_statement.where(
            or_(
                SparePart.title.ilike(q),
                SparePart.sku.ilike(q),
                SparePart.description.ilike(q),
            )
        )
    if below_min:
        statement = statement.where(
            SparePart.min_quantity.isnot(None),
            SparePart.quantity <= SparePart.min_quantity,
        )
        count_statement = count_statement.where(
            SparePart.min_quantity.isnot(None),
            SparePart.quantity <= SparePart.min_quantity,
        )

    _sort_by = sort_by if sort_by in ("title", "sku", "quantity", "created_at") else "title"
    _sort_order = sort_order if sort_order in ("asc", "desc") else "asc"
    col = getattr(SparePart, _sort_by)
    statement = statement.order_by(col.desc() if _sort_order == "desc" else col.asc())

    count = session.exec(count_statement).one()
    statement = statement.offset(skip).limit(limit)
    parts = list(session.exec(statement).all())

    return SparePartsPublic(
        data=[SparePartPublic.model_validate(p) for p in parts],
        count=count,
    )


def _get_spare_part_or_404(session: SessionDep, id: uuid.UUID) -> SparePart:
    part = session.get(SparePart, id)
    if not part:
        raise HTTPException(status_code=404, detail="Запчасть не найдена")
    return part


@router.get("/{id}", response_model=SparePartPublic)
def get_spare_part(session: SessionDep, _current_user: CurrentUser, id: uuid.UUID) -> Any:
    return _get_spare_part_or_404(session, id)


@router.post("/", response_model=SparePartPublic)
def create_spare_part(
    session: SessionDep,
    _current_user: CurrentUser,
    body: SparePartCreate,
) -> Any:
    part = SparePart.model_validate(body)
    session.add(part)
    session.commit()
    session.refresh(part)
    return part


@router.put("/{id}", response_model=SparePartPublic)
def update_spare_part(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
    body: SparePartUpdate,
) -> Any:
    part = _get_spare_part_or_404(session, id)
    update_data = body.model_dump(exclude_unset=True)
    part.sqlmodel_update(update_data)
    part.updated_at = datetime.now(timezone.utc)
    session.add(part)
    session.commit()
    session.refresh(part)
    return part


@router.delete("/{id}")
def delete_spare_part(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    part = _get_spare_part_or_404(session, id)
    session.delete(part)
    session.commit()
    return {"message": "Запчасть удалена"}
