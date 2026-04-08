"""API справочника зон склада (управление в админке)."""
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.audit import get_client_ip, log_audit
from app.core.permissions import PERM_ZONES_MANAGE
from app.models import (
    Message,
    Warehouse,
    WarehouseZone,
    WarehouseZoneCreate,
    WarehouseZonePublic,
    WarehouseZoneUpdate,
)

router = APIRouter(prefix="/zones", tags=["zones"])


def _resolve_warehouse_id(session: SessionDep, warehouse_id: uuid.UUID | None) -> uuid.UUID:
    if warehouse_id is not None:
        wh = session.get(Warehouse, warehouse_id)
        if not wh:
            raise HTTPException(status_code=404, detail="Склад не найден")
        return warehouse_id
    wh = session.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if not wh:
        wh = session.exec(select(Warehouse).order_by(Warehouse.created_at)).first()
    if not wh:
        raise HTTPException(status_code=500, detail="Не настроен ни один склад")
    return wh.id


@router.get("/", response_model=list[WarehouseZonePublic])
def read_zones(
    session: SessionDep,
    _current_user: CurrentUser,
    warehouse_id: uuid.UUID | None = Query(
        default=None,
        description="Фильтр по складу; без параметра — все зоны",
    ),
) -> Any:
    """Список зон склада (для выбора в форме техники и в админке)."""
    stmt = select(WarehouseZone)
    if warehouse_id is not None:
        stmt = stmt.where(WarehouseZone.warehouse_id == warehouse_id)
    return list(session.exec(stmt.order_by(WarehouseZone.name)).all())


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
    wid = _resolve_warehouse_id(session, body.warehouse_id)
    existing = session.exec(
        select(WarehouseZone).where(
            WarehouseZone.warehouse_id == wid,
            WarehouseZone.name == body.name,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Зона с таким названием уже есть на этом складе",
        )
    zone = WarehouseZone(
        name=body.name,
        warehouse_id=wid,
        code=body.code,
        zone_kind=body.zone_kind,
    )
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
    target_wh = zone.warehouse_id
    if body.warehouse_id is not None:
        target_wh = _resolve_warehouse_id(session, body.warehouse_id)
    name_for_uniq = body.name if body.name is not None else zone.name
    if body.name is not None or (
        body.warehouse_id is not None and body.warehouse_id != zone.warehouse_id
    ):
        other = session.exec(
            select(WarehouseZone).where(
                WarehouseZone.warehouse_id == target_wh,
                WarehouseZone.name == name_for_uniq,
                WarehouseZone.id != id,
            )
        ).first()
        if other:
            raise HTTPException(
                status_code=400,
                detail="Зона с таким названием уже есть на этом складе",
            )
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
    session.commit()
    return Message(message="Зона удалена")
