"""API справочника зон склада (управление в админке)."""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.audit import get_client_ip, log_audit
from app.core.permissions import PERM_ZONES_MANAGE
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
    dependencies=[require_permission(PERM_ZONES_MANAGE)],
)
def create_zone(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    body: WarehouseZoneCreate,
) -> Any:
    """Создать зону."""
    existing = session.exec(select(WarehouseZone).where(WarehouseZone.name == body.name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Зона с таким названием уже существует")
    zone = WarehouseZone.model_validate(body)
    session.add(zone)
    session.commit()
    session.refresh(zone)
    log_audit(
        session,
        user_id=current_user.id,
        action="zone.create",
        resource_type="zone",
        resource_id=zone.id,
        details={"name": zone.name},
        ip_address=get_client_ip(request),
    )
    return zone


@router.put(
    "/{id}",
    response_model=WarehouseZonePublic,
    dependencies=[require_permission(PERM_ZONES_MANAGE)],
)
def update_zone(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    id: uuid.UUID,
    body: WarehouseZoneUpdate,
) -> Any:
    """Обновить зону."""
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
    log_audit(
        session,
        user_id=current_user.id,
        action="zone.update",
        resource_type="zone",
        resource_id=zone.id,
        details={"name": zone.name, "updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
    )
    return zone


@router.delete(
    "/{id}",
    response_model=Message,
    dependencies=[require_permission(PERM_ZONES_MANAGE)],
)
def delete_zone(
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Message:
    """Удалить зону."""
    zone = session.get(WarehouseZone, id)
    if not zone:
        raise HTTPException(status_code=404, detail="Зона не найдена")
    name = zone.name
    session.delete(zone)
    log_audit(
        session,
        user_id=current_user.id,
        action="zone.delete",
        resource_type="zone",
        resource_id=id,
        details={"name": name},
        ip_address=get_client_ip(request),
    )
    return Message(message="Зона удалена")
