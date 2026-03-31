"""API для раздела «Список техники» — складская техника, бренды из справочника."""
import uuid
from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlmodel import func, select, update

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    EQUIPMENT_TYPES,
    Brand,
    Equipment,
    EquipmentCreate,
    EquipmentCurrentStatusPatch,
    EquipmentImportResult,
    EquipmentImportRowError,
    EquipmentList,
    EquipmentPublic,
    EquipmentUpdate,
    MaintenanceRecord,
    MaintenanceRecordCreate,
    MaintenanceRecordList,
    MaintenanceRecordListWithEquipment,
    MaintenanceRecordPublic,
    MaintenanceRecordWithEquipmentPublic,
    Message,
)
from app.services.equipment_import import (
    MAX_IMPORT_BYTES,
    build_equipment_import_template_xlsx,
    import_equipment_from_spreadsheet,
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
        garage_number=eq.garage_number,
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


SORT_FIELDS = {
    "brand_model",
    "engine_hours",
    "commissioned_at",
    "current_status",
    "serial_number",
    "garage_number",
    "equipment_type",
    "zone",
}


@router.get("/", response_model=EquipmentList)
def read_equipment_list(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    search: str | None = Query(None, description="Поиск по VIN, серийному номеру, бренду, модели"),
    current_status: str | None = Query(None, description="Фильтр по состоянию"),
    equipment_type: str | None = Query(None, description="Фильтр по типу техники"),
    brand_id: uuid.UUID | None = Query(None, description="Фильтр по бренду"),
    sort_by: str | None = Query(
        None,
        description="Сортировка: brand_model, serial_number, garage_number, equipment_type, zone, engine_hours, commissioned_at, current_status",
    ),
    order: str = Query("asc", description="Направление: asc или desc"),
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
            | Equipment.garage_number.ilike(q)
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

    if sort_by in SORT_FIELDS and order in ("asc", "desc"):
        if sort_by == "brand_model":
            if order == "asc":
                statement = statement.order_by(Brand.name.asc(), Equipment.model.asc())
            else:
                statement = statement.order_by(Brand.name.desc(), Equipment.model.desc())
        elif sort_by == "engine_hours":
            if order == "asc":
                statement = statement.order_by(Equipment.engine_hours.asc().nulls_last())
            else:
                statement = statement.order_by(Equipment.engine_hours.desc().nulls_first())
        elif sort_by == "commissioned_at":
            if order == "asc":
                statement = statement.order_by(Equipment.commissioned_at.asc().nulls_last())
            else:
                statement = statement.order_by(Equipment.commissioned_at.desc().nulls_first())
        elif sort_by == "current_status":
            if order == "asc":
                statement = statement.order_by(Equipment.current_status.asc())
            else:
                statement = statement.order_by(Equipment.current_status.desc())
        elif sort_by == "serial_number":
            if order == "asc":
                statement = statement.order_by(Equipment.serial_number.asc().nulls_last())
            else:
                statement = statement.order_by(Equipment.serial_number.desc().nulls_first())
        elif sort_by == "garage_number":
            if order == "asc":
                statement = statement.order_by(Equipment.garage_number.asc().nulls_last())
            else:
                statement = statement.order_by(Equipment.garage_number.desc().nulls_first())
        elif sort_by == "equipment_type":
            if order == "asc":
                statement = statement.order_by(Equipment.equipment_type.asc())
            else:
                statement = statement.order_by(Equipment.equipment_type.desc())
        elif sort_by == "zone":
            if order == "asc":
                statement = statement.order_by(Equipment.zone.asc().nulls_last())
            else:
                statement = statement.order_by(Equipment.zone.desc().nulls_first())
    else:
        statement = statement.order_by(Equipment.created_at.desc())

    statement = statement.offset(skip).limit(limit)
    rows = list(session.exec(statement).all())
    items = [_equipment_to_public(eq, brand) for eq, brand in rows]
    return EquipmentList(data=items, count=count)


@router.get("/maintenance-records", response_model=MaintenanceRecordListWithEquipment)
def read_all_maintenance_records(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    equipment_id: uuid.UUID | None = Query(None, description="Фильтр по единице техники"),
) -> Any:
    """Общий список проведённых ТО (для раздела «Рабочие заказы»)."""
    statement = (
        select(MaintenanceRecord, Equipment, Brand)
        .join(Equipment, MaintenanceRecord.equipment_id == Equipment.id)
        .join(Brand, Equipment.brand_id == Brand.id)
        .where(Equipment.equipment_type.in_(EQUIPMENT_TYPES))
    )
    count_statement = (
        select(func.count())
        .select_from(MaintenanceRecord)
        .join(Equipment, MaintenanceRecord.equipment_id == Equipment.id)
        .where(Equipment.equipment_type.in_(EQUIPMENT_TYPES))
    )
    if equipment_id is not None:
        statement = statement.where(MaintenanceRecord.equipment_id == equipment_id)
        count_statement = count_statement.where(MaintenanceRecord.equipment_id == equipment_id)

    count = session.exec(count_statement).one()
    statement = (
        statement.order_by(MaintenanceRecord.performed_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = list(session.exec(statement).all())
    items = [
        MaintenanceRecordWithEquipmentPublic(
            id=r.id,
            equipment_id=r.equipment_id,
            equipment_name=f"{brand.name} {eq.model}".strip(),
            performed_at=r.performed_at,
            engine_hours_at_service=r.engine_hours_at_service,
            interval_hours=r.interval_hours,
            comment=r.comment,
        )
        for r, eq, brand in rows
    ]
    return MaintenanceRecordListWithEquipment(data=items, count=count)


@router.get("/{equipment_id}/maintenance-records", response_model=MaintenanceRecordList)
def read_equipment_maintenance_records(
    session: SessionDep,
    _current_user: CurrentUser,
    equipment_id: uuid.UUID,
) -> Any:
    """Список проведённых ТО по единице техники."""
    equipment = _get_or_404(session, equipment_id)
    if equipment.equipment_type not in EQUIPMENT_TYPES:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    statement = (
        select(MaintenanceRecord)
        .where(MaintenanceRecord.equipment_id == equipment_id)
        .order_by(MaintenanceRecord.performed_at.desc())
    )
    records = list(session.exec(statement).all())
    count = len(records)
    items = [
        MaintenanceRecordPublic(
            id=r.id,
            equipment_id=r.equipment_id,
            performed_at=r.performed_at,
            engine_hours_at_service=r.engine_hours_at_service,
            interval_hours=r.interval_hours,
            comment=r.comment,
        )
        for r in records
    ]
    return MaintenanceRecordList(data=items, count=count)


@router.post("/{equipment_id}/maintenance-records", response_model=MaintenanceRecordPublic)
def create_maintenance_record(
    session: SessionDep,
    _current_user: CurrentUser,
    equipment_id: uuid.UUID,
    body: MaintenanceRecordCreate,
) -> Any:
    """Создать запись о проведённом ТО по единице техники."""
    equipment = _get_or_404(session, equipment_id)
    if equipment.equipment_type not in EQUIPMENT_TYPES:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    record = MaintenanceRecord(
        equipment_id=equipment_id,
        performed_at=body.performed_at,
        engine_hours_at_service=body.engine_hours_at_service,
        interval_hours=body.interval_hours,
        comment=body.comment,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return MaintenanceRecordPublic(
        id=record.id,
        equipment_id=record.equipment_id,
        performed_at=record.performed_at,
        engine_hours_at_service=record.engine_hours_at_service,
        interval_hours=record.interval_hours,
        comment=record.comment,
    )


@router.get("/import-template")
def download_equipment_import_template(_current_user: CurrentUser) -> Response:
    """Скачать пустой .xlsx с заголовками столбцов для массового импорта техники."""
    data = build_equipment_import_template_xlsx()
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="shablon_importa_tehniki.xlsx"',
        },
    )


@router.get("/{id}", response_model=EquipmentPublic)
def read_equipment(session: SessionDep, _current_user: CurrentUser, id: uuid.UUID) -> Any:
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
    _current_user: CurrentUser,
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


@router.post("/import", response_model=EquipmentImportResult)
async def import_equipment_file(
    session: SessionDep,
    _current_user: CurrentUser,
    file: UploadFile = File(..., description="Таблица Excel .xlsx"),
) -> Any:
    """
    Массовое добавление техники из первого листа файла (.xlsx).
    В первой строке — заголовки: тип техники, бренд, модель (обязательно); остальные поля — по желанию.
    """
    content = await file.read()
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Файл слишком большой (максимум 8 МБ)",
        )
    if not content:
        raise HTTPException(status_code=400, detail="Пустой файл")
    fn = (file.filename or "").lower()
    if not fn.endswith(".xlsx"):
        raise HTTPException(
            status_code=400,
            detail="Загрузите файл в формате .xlsx (Excel 2007 и новее).",
        )
    name = file.filename or "import.xlsx"
    try:
        created, errs = import_equipment_from_spreadsheet(session, content, name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return EquipmentImportResult(
        created=created,
        errors=[EquipmentImportRowError(row=r, message=m) for r, m in errs],
    )


@router.patch("/{id}/current-status", response_model=EquipmentPublic)
def patch_equipment_current_status(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
    body: EquipmentCurrentStatusPatch,
) -> Any:
    """Сменить только current_status одной строки (явный UPDATE по id)."""
    equipment = _get_or_404(session, id)
    if equipment.equipment_type not in EQUIPMENT_TYPES:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    session.exec(
        update(Equipment)
        .where(Equipment.id == id)
        .values(current_status=body.current_status)
    )
    session.commit()
    session.refresh(equipment)
    brand = session.get(Brand, equipment.brand_id)
    return _equipment_to_public(equipment, brand)


@router.put("/{id}", response_model=EquipmentPublic)
def update_equipment(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
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
    _current_user: CurrentUser,
    id: uuid.UUID,
) -> Message:
    """Удалить единицу техники."""
    equipment = _get_or_404(session, id)
    session.delete(equipment)
    session.commit()
    return Message(message="Техника удалена")
