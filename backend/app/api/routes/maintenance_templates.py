"""CRUD for maintenance reglament templates (checklist + required spares)."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.permissions import (
    PERM_MAINTENANCE_SCHEDULE_EDIT,
    can_edit_maintenance_schedule,
    can_view_maintenance_schedule,
)
from app.models import (
    EQUIPMENT_TYPES,
    MaintenanceReglamentTemplate,
    MaintenanceReglamentTemplateCreate,
    MaintenanceReglamentTemplateDetailPublic,
    MaintenanceReglamentTemplateList,
    MaintenanceTemplateChecklistItem,
    MaintenanceTemplateChecklistItemPublic,
    MaintenanceTemplateSparePartRequirement,
    MaintenanceTemplateSparePartRequirementPublic,
    SparePart,
)

router = APIRouter(prefix="/maintenance-templates", tags=["maintenance-templates"])


def _assert_template_permissions(session: SessionDep, current_user: CurrentUser, *, can_edit: bool) -> None:
    if can_edit:
        if not can_edit_maintenance_schedule(session, current_user):
            raise HTTPException(status_code=403, detail="Недостаточно прав для редактирования")
    else:
        if not can_view_maintenance_schedule(session, current_user):
            raise HTTPException(status_code=403, detail="Недостаточно прав для просмотра")


def _get_template_detail(session: SessionDep, template: MaintenanceReglamentTemplate) -> MaintenanceReglamentTemplateDetailPublic:
    checklist_rows = list(
        session.exec(
            select(MaintenanceTemplateChecklistItem)
            .where(MaintenanceTemplateChecklistItem.template_id == template.id)
            .order_by(MaintenanceTemplateChecklistItem.sort_order.asc(), MaintenanceTemplateChecklistItem.id)
        ).all()
    )
    checklist_public = [
        MaintenanceTemplateChecklistItemPublic(
            id=r.id,
            title=r.title,
            sort_order=r.sort_order,
        )
        for r in checklist_rows
    ]

    req_rows = list(
        session.exec(
            select(MaintenanceTemplateSparePartRequirement)
            .where(MaintenanceTemplateSparePartRequirement.template_id == template.id)
            .order_by(MaintenanceTemplateSparePartRequirement.id.asc())
        ).all()
    )
    spare_ids = {r.spare_part_id for r in req_rows}
    spares = {s.id: s for s in session.exec(select(SparePart).where(SparePart.id.in_(spare_ids))).all()} if spare_ids else {}
    req_public = [
        MaintenanceTemplateSparePartRequirementPublic(
            id=r.id,
            spare_part_id=r.spare_part_id,
            spare_part_title=spares.get(r.spare_part_id).title if spares.get(r.spare_part_id) else None,
            spare_part_sku=spares.get(r.spare_part_id).sku if spares.get(r.spare_part_id) else None,
            quantity=r.quantity,
        )
        for r in req_rows
    ]

    return MaintenanceReglamentTemplateDetailPublic(
        id=template.id,
        equipment_type=template.equipment_type,
        interval_hours=template.interval_hours,
        created_at=template.created_at,
        updated_at=template.updated_at,
        checklist_items=checklist_public,
        spare_part_requirements=req_public,
    )


@router.get("", response_model=MaintenanceReglamentTemplateList)
def list_templates(
    session: SessionDep,
    current_user: CurrentUser,
    equipment_type: str | None = Query(None, description="Фильтр по типу техники"),
    interval_hours: int | None = Query(None, description="Фильтр по интервалу (если задан)"),
) -> MaintenanceReglamentTemplateList:
    _assert_template_permissions(session, current_user, can_edit=False)

    statement = select(MaintenanceReglamentTemplate)
    if equipment_type is not None:
        statement = statement.where(MaintenanceReglamentTemplate.equipment_type == equipment_type)
    if interval_hours is not None:
        statement = statement.where(MaintenanceReglamentTemplate.interval_hours == interval_hours)

    templates = list(session.exec(statement.order_by(MaintenanceReglamentTemplate.equipment_type.asc(), MaintenanceReglamentTemplate.interval_hours.asc())).all())
    return MaintenanceReglamentTemplateList(data=[
        {
            "id": t.id,
            "equipment_type": t.equipment_type,
            "interval_hours": t.interval_hours,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }
        for t in templates
    ], count=len(templates))


@router.get("/{id}", response_model=MaintenanceReglamentTemplateDetailPublic)
def get_template(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> MaintenanceReglamentTemplateDetailPublic:
    _assert_template_permissions(session, current_user, can_edit=False)

    template = session.get(MaintenanceReglamentTemplate, id)
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    return _get_template_detail(session, template)


@router.post(
    "",
    response_model=MaintenanceReglamentTemplateDetailPublic,
    dependencies=[require_permission(PERM_MAINTENANCE_SCHEDULE_EDIT)],
)
def create_template(
    session: SessionDep,
    current_user: CurrentUser,
    body: MaintenanceReglamentTemplateCreate,
) -> MaintenanceReglamentTemplateDetailPublic:
    # require_permission уже проверит edit, но оставим явную проверку для читаемости.
    if not can_edit_maintenance_schedule(session, current_user):
        raise HTTPException(status_code=403, detail="Недостаточно прав для редактирования")

    if body.equipment_type not in EQUIPMENT_TYPES:
        raise HTTPException(status_code=400, detail="Недопустимый тип техники")

    template = MaintenanceReglamentTemplate(
        equipment_type=body.equipment_type,
        interval_hours=body.interval_hours,
    )
    session.add(template)
    session.flush()

    checklist_items: list[MaintenanceTemplateChecklistItem] = []
    for idx, item in enumerate(body.checklist_items):
        checklist_items.append(
            MaintenanceTemplateChecklistItem(
                template_id=template.id,
                title=item.title,
                sort_order=item.sort_order if item.sort_order is not None else idx,
            )
        )
    session.add_all(checklist_items)

    spare_requirements: list[MaintenanceTemplateSparePartRequirement] = []
    spare_ids = {r.spare_part_id for r in body.spare_part_requirements}
    spares = {s.id: s for s in session.exec(select(SparePart).where(SparePart.id.in_(spare_ids))).all()} if spare_ids else {}
    for req in body.spare_part_requirements:
        if req.spare_part_id not in spares:
            raise HTTPException(status_code=404, detail=f"Запчасть {req.spare_part_id} не найдена")
        spare_requirements.append(
            MaintenanceTemplateSparePartRequirement(
                template_id=template.id,
                spare_part_id=req.spare_part_id,
                quantity=req.quantity,
            )
        )
    session.add_all(spare_requirements)

    session.commit()
    session.refresh(template)
    return _get_template_detail(session, template)


@router.put(
    "/{id}",
    response_model=MaintenanceReglamentTemplateDetailPublic,
    dependencies=[require_permission(PERM_MAINTENANCE_SCHEDULE_EDIT)],
)
def update_template(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    body: MaintenanceReglamentTemplateCreate,
) -> MaintenanceReglamentTemplateDetailPublic:
    if not can_edit_maintenance_schedule(session, current_user):
        raise HTTPException(status_code=403, detail="Недостаточно прав для редактирования")

    template = session.get(MaintenanceReglamentTemplate, id)
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")

    if body.equipment_type not in EQUIPMENT_TYPES:
        raise HTTPException(status_code=400, detail="Недопустимый тип техники")

    template.equipment_type = body.equipment_type
    template.interval_hours = body.interval_hours
    template.updated_at = datetime.now(timezone.utc)

    # Replace child records (v1 simple approach).
    existing_checklist = list(
        session.exec(
            select(MaintenanceTemplateChecklistItem).where(
                MaintenanceTemplateChecklistItem.template_id == template.id
            )
        ).all()
    )
    for row in existing_checklist:
        session.delete(row)

    existing_requirements = list(
        session.exec(
            select(MaintenanceTemplateSparePartRequirement).where(
                MaintenanceTemplateSparePartRequirement.template_id == template.id
            )
        ).all()
    )
    for row in existing_requirements:
        session.delete(row)

    # Recreate.
    checklist_items: list[MaintenanceTemplateChecklistItem] = []
    for idx, item in enumerate(body.checklist_items):
        checklist_items.append(
            MaintenanceTemplateChecklistItem(
                template_id=template.id,
                title=item.title,
                sort_order=item.sort_order if item.sort_order is not None else idx,
            )
        )
    session.add_all(checklist_items)

    spare_requirements: list[MaintenanceTemplateSparePartRequirement] = []
    spare_ids = {r.spare_part_id for r in body.spare_part_requirements}
    spares = {s.id: s for s in session.exec(select(SparePart).where(SparePart.id.in_(spare_ids))).all()} if spare_ids else {}
    for req in body.spare_part_requirements:
        if req.spare_part_id not in spares:
            raise HTTPException(status_code=404, detail=f"Запчасть {req.spare_part_id} не найдена")
        spare_requirements.append(
            MaintenanceTemplateSparePartRequirement(
                template_id=template.id,
                spare_part_id=req.spare_part_id,
                quantity=req.quantity,
            )
        )
    session.add_all(spare_requirements)

    session.add(template)
    session.commit()
    session.refresh(template)
    return _get_template_detail(session, template)


@router.delete(
    "/{id}",
    response_model=dict,
    dependencies=[require_permission(PERM_MAINTENANCE_SCHEDULE_EDIT)],
)
def delete_template(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> dict:
    if not can_edit_maintenance_schedule(session, current_user):
        raise HTTPException(status_code=403, detail="Недостаточно прав для редактирования")

    template = session.get(MaintenanceReglamentTemplate, id)
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    session.delete(template)
    session.commit()
    return {"message": "Шаблон удалён"}

