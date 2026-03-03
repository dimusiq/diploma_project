"""API справочника брендов техники (управление в админке)."""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.audit import get_client_ip, log_audit
from app.core.permissions import PERM_BRANDS_MANAGE
from app.models import Brand, BrandCreate, BrandPublic, BrandUpdate, Equipment, Message

router = APIRouter(prefix="/brands", tags=["brands"])


@router.get("/", response_model=list[BrandPublic])
def read_brands(session: SessionDep, _current_user: CurrentUser) -> Any:
    """Список брендов (для выбора в форме техники и в админке)."""
    return list(session.exec(select(Brand).order_by(Brand.name)).all())


@router.get("/{id}", response_model=BrandPublic)
def read_brand(session: SessionDep, _current_user: CurrentUser, id: uuid.UUID) -> Any:
    """Получить бренд по ID."""
    brand = session.get(Brand, id)
    if not brand:
        raise HTTPException(status_code=404, detail="Бренд не найден")
    return brand


@router.post(
    "/",
    response_model=BrandPublic,
    dependencies=[require_permission(PERM_BRANDS_MANAGE)],
)
def create_brand(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    body: BrandCreate,
) -> Any:
    """Создать бренд."""
    existing = session.exec(select(Brand).where(Brand.name == body.name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Бренд с таким названием уже существует")
    brand = Brand.model_validate(body)
    session.add(brand)
    session.commit()
    session.refresh(brand)
    log_audit(
        session,
        user_id=current_user.id,
        action="brand.create",
        resource_type="brand",
        resource_id=brand.id,
        details={"name": brand.name},
        ip_address=get_client_ip(request),
    )
    return brand


@router.put(
    "/{id}",
    response_model=BrandPublic,
    dependencies=[require_permission(PERM_BRANDS_MANAGE)],
)
def update_brand(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    id: uuid.UUID,
    body: BrandUpdate,
) -> Any:
    """Обновить бренд."""
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
    log_audit(
        session,
        user_id=current_user.id,
        action="brand.update",
        resource_type="brand",
        resource_id=brand.id,
        details={"name": brand.name, "updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
    )
    return brand


@router.delete(
    "/{id}",
    response_model=Message,
    dependencies=[require_permission(PERM_BRANDS_MANAGE)],
)
def delete_brand(
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Message:
    """Удалить бренд. Нельзя удалить, если к нему привязана техника."""
    brand = session.get(Brand, id)
    if not brand:
        raise HTTPException(status_code=404, detail="Бренд не найден")
    used = session.exec(select(func.count()).select_from(Equipment).where(Equipment.brand_id == id)).one()
    if used > 0:
        raise HTTPException(
            status_code=400,
            detail="Нельзя удалить бренд, к которому привязана техника. Сначала измените бренд у единиц техники.",
        )
    name = brand.name
    session.delete(brand)
    log_audit(
        session,
        user_id=current_user.id,
        action="brand.delete",
        resource_type="brand",
        resource_id=id,
        details={"name": name},
        ip_address=get_client_ip(request),
    )
    return Message(message="Бренд удалён")
