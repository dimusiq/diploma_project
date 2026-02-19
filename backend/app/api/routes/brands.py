"""API справочника брендов техники (управление в админке)."""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.models import Brand, BrandCreate, BrandPublic, BrandUpdate, Equipment, Message

router = APIRouter(prefix="/brands", tags=["brands"])


@router.get("/", response_model=list[BrandPublic])
def read_brands(session: SessionDep, current_user: CurrentUser) -> Any:
    """Список брендов (для выбора в форме техники и в админке)."""
    return list(session.exec(select(Brand).order_by(Brand.name)).all())


@router.get("/{id}", response_model=BrandPublic)
def read_brand(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """Получить бренд по ID."""
    brand = session.get(Brand, id)
    if not brand:
        raise HTTPException(status_code=404, detail="Бренд не найден")
    return brand


@router.post(
    "/",
    response_model=BrandPublic,
    dependencies=[Depends(get_current_active_superuser)],
)
def create_brand(*, session: SessionDep, body: BrandCreate) -> Any:
    """Создать бренд (только суперпользователь)."""
    existing = session.exec(select(Brand).where(Brand.name == body.name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Бренд с таким названием уже существует")
    brand = Brand.model_validate(body)
    session.add(brand)
    session.commit()
    session.refresh(brand)
    return brand


@router.put(
    "/{id}",
    response_model=BrandPublic,
    dependencies=[Depends(get_current_active_superuser)],
)
def update_brand(*, session: SessionDep, id: uuid.UUID, body: BrandUpdate) -> Any:
    """Обновить бренд (только суперпользователь)."""
    brand = session.get(Brand, id)
    if not brand:
        raise HTTPException(status_code=404, detail="Бренд не найден")
    if body.name is not None:
        other = session.exec(select(Brand).where(Brand.name == body.name, Brand.id != id)).first()
        if other:
            raise HTTPException(status_code=400, detail="Бренд с таким названием уже существует")
    update_data = body.model_dump(exclude_unset=True)
    brand.sqlmodel_update(update_data)
    session.add(brand)
    session.commit()
    session.refresh(brand)
    return brand


@router.delete(
    "/{id}",
    response_model=Message,
    dependencies=[Depends(get_current_active_superuser)],
)
def delete_brand(session: SessionDep, id: uuid.UUID) -> Message:
    """Удалить бренд (только суперпользователь). Нельзя удалить бренд, если к нему привязана техника."""
    brand = session.get(Brand, id)
    if not brand:
        raise HTTPException(status_code=404, detail="Бренд не найден")
    used = session.exec(select(func.count()).select_from(Equipment).where(Equipment.brand_id == id)).one()
    if used > 0:
        raise HTTPException(
            status_code=400,
            detail="Нельзя удалить бренд, к которому привязана техника. Сначала измените бренд у единиц техники.",
        )
    session.delete(brand)
    session.commit()
    return Message(message="Бренд удалён")
