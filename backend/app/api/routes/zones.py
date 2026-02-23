"""API справочника зон склада (управление в админке)."""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.models import (
    Message,
    WarehouseZone,
    WarehouseZoneCreate,
    WarehouseZonePublic,
    WarehouseZoneUpdate,
)

router = APIRouter(prefix="/zones", tags=["zones"])


@router.get("/", response_model=list[WarehouseZonePublic])
def read_zones(session: SessionDep, _current_user: CurrentUser) -> Any:
    """Список зон склада (для выбора в форме техники и в админке)."""
    return list(session.exec(select(WarehouseZone).order_by(WarehouseZone.name)).all())


@router.get("/{id}", response_model=WarehouseZonePublic)
def read_zone(session: SessionDep, _current_user: CurrentUser, id: uuid.UUID) -> Any:
    """Получить зону по ID."""
    zone = session.get(WarehouseZone, id)
    if not zone:
        raise HTTPException(status_code=404, detail="Зона не найдена")
    return zone


@router.post(
    "/",
    response_model=WarehouseZonePublic,
    dependencies=[Depends(get_current_active_superuser)],
)
def create_zone(*, session: SessionDep, body: WarehouseZoneCreate) -> Any:
    """Создать зону (только суперпользователь)."""
    existing = session.exec(select(WarehouseZone).where(WarehouseZone.name == body.name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Зона с таким названием уже существует")
    zone = WarehouseZone.model_validate(body)
    session.add(zone)
    session.commit()
    session.refresh(zone)
    return zone


@router.put(
    "/{id}",
    response_model=WarehouseZonePublic,
    dependencies=[Depends(get_current_active_superuser)],
)
def update_zone(*, session: SessionDep, id: uuid.UUID, body: WarehouseZoneUpdate) -> Any:
    """Обновить зону (только суперпользователь)."""
    zone = session.get(WarehouseZone, id)
    if not zone:
        raise HTTPException(status_code=404, detail="Зона не найдена")
    if body.name is not None:
        other = session.exec(
            select(WarehouseZone).where(WarehouseZone.name == body.name, WarehouseZone.id != id)
        ).first()
        if other:
            raise HTTPException(status_code=400, detail="Зона с таким названием уже существует")
    update_data = body.model_dump(exclude_unset=True)
    zone.sqlmodel_update(update_data)
    session.add(zone)
    session.commit()
    session.refresh(zone)
    return zone


@router.delete(
    "/{id}",
    response_model=Message,
    dependencies=[Depends(get_current_active_superuser)],
)
def delete_zone(session: SessionDep, id: uuid.UUID) -> Message:
    """Удалить зону (только суперпользователь)."""
    zone = session.get(WarehouseZone, id)
    if not zone:
        raise HTTPException(status_code=404, detail="Зона не найдена")
    session.delete(zone)
    session.commit()
    return Message(message="Зона удалена")
