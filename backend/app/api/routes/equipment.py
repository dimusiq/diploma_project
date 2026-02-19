"""API для раздела «Список техники» — складская техника, бренды из справочника."""
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Brand,
    EQUIPMENT_TYPES,
    Equipment,
    EquipmentCreate,
    EquipmentList,
    EquipmentPublic,
    EquipmentUpdate,
    Message,
)

router = APIRouter(prefix="/equipment", tags=["equipment"])


def _get_or_404(session: SessionDep, id: uuid.UUID) -> Equipment:
    obj = session.get(Equipment, id)
    if not obj:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    return obj


def _equipment_to_public(eq: Equipment, brand: Brand | None = None) -> EquipmentPublic:
    name = brand.name if brand else (getattr(eq, "brand", None) and eq.brand.name or "")
    return EquipmentPublic(
        id=eq.id,
        equipment_type=eq.equipment_type,
        vin=eq.vin,
        serial_number=eq.serial_number,
        brand_id=eq.brand_id,
        brand_name=name,
        model=eq.model,
        commissioned_at=eq.commissioned_at,
        engine_hours=eq.engine_hours,
        current_status=eq.current_status,
        zone=eq.zone,
        attachments=eq.attachments,
        instructions=eq.instructions,
        created_at=eq.created_at,
    )


@router.get("/", response_model=EquipmentList)
def read_equipment_list(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    search: str | None = Query(None, description="Поиск по VIN, серийному номеру, бренду, модели"),
    current_status: str | None = Query(None, description="Фильтр по состоянию"),
    equipment_type: str | None = Query(None, description="Фильтр по типу техники"),
    brand_id: uuid.UUID | None = Query(None, description="Фильтр по бренду"),
) -> Any:
    """Список складской техники. Бренды задаются в панели администрирования."""
    statement = (
        select(Equipment, Brand)
        .join(Brand, Equipment.brand_id == Brand.id)
        .where(Equipment.equipment_type.in_(EQUIPMENT_TYPES))
    )
    count_statement = select(func.count()).select_from(Equipment).where(
        Equipment.equipment_type.in_(EQUIPMENT_TYPES)
    )

    if search and search.strip():
        q = f"%{search.strip()}%"
        cond = (
            Equipment.vin.ilike(q)
            | Equipment.serial_number.ilike(q)
            | Brand.name.ilike(q)
            | Equipment.model.ilike(q)
        )
        statement = statement.where(cond)
        count_statement = count_statement.join(Brand, Equipment.brand_id == Brand.id).where(cond)
    if current_status is not None and current_status != "":
        statement = statement.where(Equipment.current_status == current_status)
        count_statement = count_statement.where(Equipment.current_status == current_status)
    if equipment_type is not None and equipment_type != "" and equipment_type in EQUIPMENT_TYPES:
        statement = statement.where(Equipment.equipment_type == equipment_type)
        count_statement = count_statement.where(Equipment.equipment_type == equipment_type)
    if brand_id is not None:
        statement = statement.where(Equipment.brand_id == brand_id)
        count_statement = count_statement.where(Equipment.brand_id == brand_id)

    count = session.exec(count_statement).one()
    statement = statement.order_by(Equipment.created_at.desc()).offset(skip).limit(limit)
    rows = list(session.exec(statement).all())
    items = [_equipment_to_public(eq, brand) for eq, brand in rows]
    return EquipmentList(data=items, count=count)


@router.get("/{id}", response_model=EquipmentPublic)
def read_equipment(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """Получить единицу техники по ID."""
    equipment = _get_or_404(session, id)
    if equipment.equipment_type not in EQUIPMENT_TYPES:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    brand = session.get(Brand, equipment.brand_id)
    return _equipment_to_public(equipment, brand)


def _validate_equipment_type(equipment_type: str | None) -> None:
    if equipment_type is not None and equipment_type not in EQUIPMENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Допустимые типы: autopogruzchik, elektropogruzchik, komplektovshchik, richtrak, elektrotelezhka",
        )


@router.post("/", response_model=EquipmentPublic)
def create_equipment(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    body: EquipmentCreate,
) -> Any:
    """Добавить единицу складской техники. Бренд выбирается из справочника."""
    _validate_equipment_type(body.equipment_type)
    if session.get(Brand, body.brand_id) is None:
        raise HTTPException(status_code=400, detail="Указанный бренд не найден")
    equipment = Equipment.model_validate(body)
    session.add(equipment)
    session.commit()
    session.refresh(equipment)
    brand = session.get(Brand, equipment.brand_id)
    return _equipment_to_public(equipment, brand)


@router.put("/{id}", response_model=EquipmentPublic)
def update_equipment(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    body: EquipmentUpdate,
) -> Any:
    """Обновить единицу техники."""
    equipment = _get_or_404(session, id)
    update_data = body.model_dump(exclude_unset=True)
    if "equipment_type" in update_data:
        _validate_equipment_type(update_data["equipment_type"])
    if "brand_id" in update_data and session.get(Brand, update_data["brand_id"]) is None:
        raise HTTPException(status_code=400, detail="Указанный бренд не найден")
    equipment.sqlmodel_update(update_data)
    session.add(equipment)
    session.commit()
    session.refresh(equipment)
    brand = session.get(Brand, equipment.brand_id)
    return _equipment_to_public(equipment, brand)


@router.delete("/{id}", response_model=Message)
def delete_equipment(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Message:
    """Удалить единицу техники."""
    equipment = _get_or_404(session, id)
    session.delete(equipment)
    session.commit()
    return Message(message="Техника удалена")
