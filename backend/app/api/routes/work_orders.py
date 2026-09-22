"""API заявок на обслуживание и ремонт техники (Work Order)."""
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from app.core.audit import get_client_ip, log_audit
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    WORK_ORDER_PRIORITIES,
    WORK_ORDER_PRIORITY_MEDIUM,
    WORK_ORDER_STATUS_OPEN,
    WORK_ORDER_STATUS_WAITING_PARTS,
    WORK_ORDER_STATUSES,
    MaintenanceReglamentTemplate,
    MaintenanceTemplateChecklistItem,
    MaintenanceTemplateSparePartRequirement,
    SparePart,
    User,
    WorkOrder,
    WorkOrderAttachment,
    WorkOrderAttachmentCreate,
    WorkOrderAttachmentPublic,
    WorkOrderChecklistItem,
    WorkOrderChecklistItemCreate,
    WorkOrderChecklistItemPublic,
    WorkOrderChecklistItemUpdate,
    WorkOrderComment,
    WorkOrderCommentCreate,
    WorkOrderCommentPublic,
    WorkOrderCreate,
    WorkOrderDetailPublic,
    WorkOrderFromMaintenanceEventCreate,
    WorkOrderList,
    WorkOrderPartConsumption,
    WorkOrderPartConsumptionCreate,
    WorkOrderPartConsumptionPublic,
    WorkOrderPartReservation,
    WorkOrderPartReservationCreate,
    WorkOrderPartReservationPublic,
    WorkOrderPublic,
    WorkOrderStatusHistory,
    WorkOrderStatusHistoryPublic,
    WorkOrderUpdate,
)
from app.services.canonical_equipment import (
    canonical_device_name,
    get_canonical_device,
    require_canonical_device,
)
from app.services.work_order_conflict_service import (
    assert_no_overlapping_conflicts_or_raise,
)

router = APIRouter(prefix="/work-orders", tags=["work-orders"])


def _equipment_name(session: SessionDep, equipment_id: uuid.UUID) -> str | None:
    device = get_canonical_device(session, equipment_id)
    if device is None:
        return None
    return canonical_device_name(device)


def _work_order_to_public(
    session: SessionDep,
    wo: WorkOrder,
    *,
    equipment_name_val: str | None = None,
    assigned_to_email: str | None = None,
) -> WorkOrderPublic:
    eq_name = equipment_name_val or _equipment_name(session, wo.equipment_id)
    return WorkOrderPublic(
        id=wo.id,
        equipment_id=wo.equipment_id,
        equipment_name=eq_name,
        title=wo.title,
        description=wo.description,
        status=wo.status,
        priority=wo.priority,
        assigned_to_id=wo.assigned_to_id,
        assigned_to_email=assigned_to_email,
        start_at=wo.start_at,
        end_at=wo.end_at,
        due_at=wo.due_at,
        created_by_id=wo.created_by_id,
        created_at=wo.created_at,
        updated_at=wo.updated_at,
    )


@router.get("", response_model=WorkOrderList)
def list_work_orders(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: str | None = Query(None, description="Фильтр по статусу"),
    assigned_to_id: uuid.UUID | None = Query(None),
    priority: str | None = Query(None),
    equipment_id: uuid.UUID | None = Query(None),
) -> Any:
    """Список заявок с фильтрами."""
    if status is not None and status not in WORK_ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Недопустимый статус")
    if priority is not None and priority not in WORK_ORDER_PRIORITIES:
        raise HTTPException(status_code=400, detail="Недопустимый приоритет")

    statement = select(WorkOrder).order_by(WorkOrder.created_at.desc())
    count_statement = select(func.count()).select_from(WorkOrder)

    if status:
        statement = statement.where(WorkOrder.status == status)
        count_statement = count_statement.where(WorkOrder.status == status)
    if assigned_to_id is not None:
        statement = statement.where(WorkOrder.assigned_to_id == assigned_to_id)
        count_statement = count_statement.where(WorkOrder.assigned_to_id == assigned_to_id)
    if priority:
        statement = statement.where(WorkOrder.priority == priority)
        count_statement = count_statement.where(WorkOrder.priority == priority)
    if equipment_id is not None:
        statement = statement.where(WorkOrder.equipment_id == equipment_id)
        count_statement = count_statement.where(WorkOrder.equipment_id == equipment_id)

    count = session.exec(count_statement).one()
    statement = statement.offset(skip).limit(limit)
    orders = list(session.exec(statement).all())

    users_map: dict[uuid.UUID, str] = {}
    for wo in orders:
        if wo.assigned_to_id and wo.assigned_to_id not in users_map:
            u = session.get(User, wo.assigned_to_id)
            users_map[wo.assigned_to_id] = u.email if u else ""

    items = [
        _work_order_to_public(
            session,
            wo,
            assigned_to_email=users_map.get(wo.assigned_to_id) if wo.assigned_to_id else None,
        )
        for wo in orders
    ]
    return WorkOrderList(data=items, count=count)


@router.get("/events", response_model=WorkOrderList)
def list_work_order_events(
    session: SessionDep,
    _current_user: CurrentUser,
    from_dt: datetime = Query(..., alias="from"),
    to_dt: datetime = Query(..., alias="to"),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
) -> Any:
    """События work order для календаря: пересечение start/end с диапазоном."""
    if to_dt <= from_dt:
        raise HTTPException(status_code=400, detail="Параметр to должен быть больше from")

    statement = select(WorkOrder).where(
        WorkOrder.start_at.is_not(None),
        WorkOrder.end_at.is_not(None),
        WorkOrder.start_at < to_dt,
        WorkOrder.end_at > from_dt,
        WorkOrder.status != "canceled",
    ).order_by(WorkOrder.start_at.asc())

    count_statement = select(func.count()).select_from(WorkOrder).where(
        WorkOrder.start_at.is_not(None),
        WorkOrder.end_at.is_not(None),
        WorkOrder.start_at < to_dt,
        WorkOrder.end_at > from_dt,
        WorkOrder.status != "canceled",
    )

    count = session.exec(count_statement).one()
    orders = list(session.exec(statement.offset(skip).limit(limit)).all())

    users_map: dict[uuid.UUID, str] = {}
    for wo in orders:
        if wo.assigned_to_id and wo.assigned_to_id not in users_map:
            u = session.get(User, wo.assigned_to_id)
            users_map[wo.assigned_to_id] = u.email if u else ""

    items = [
        _work_order_to_public(
            session,
            wo,
            assigned_to_email=users_map.get(wo.assigned_to_id) if wo.assigned_to_id else None,
        )
        for wo in orders
    ]
    return WorkOrderList(data=items, count=count)


@router.post("", response_model=WorkOrderPublic)
def create_work_order(
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    body: WorkOrderCreate,
) -> Any:
    """Создать заявку (статус open)."""
    require_canonical_device(session, body.equipment_id)
    if body.assigned_to_id and session.get(User, body.assigned_to_id) is None:
        raise HTTPException(status_code=400, detail="Исполнитель не найден")

    assert_no_overlapping_conflicts_or_raise(
        session,
        equipment_id=body.equipment_id,
        assigned_to_id=body.assigned_to_id,
        start_at=body.start_at,
        end_at=body.end_at,
    )

    wo = WorkOrder(
        equipment_id=body.equipment_id,
        title=body.title,
        description=body.description,
        status="open",
        priority=body.priority,
        assigned_to_id=body.assigned_to_id,
        start_at=body.start_at,
        end_at=body.end_at,
        due_at=body.due_at,
        created_by_id=current_user.id,
    )
    session.add(wo)
    session.commit()
    session.refresh(wo)

    hist = WorkOrderStatusHistory(
        work_order_id=wo.id,
        from_status=None,
        to_status="open",
        changed_by_id=current_user.id,
        comment="Создана заявка",
    )
    session.add(hist)
    log_audit(
        session,
        user_id=current_user.id,
        action="work_order.create",
        resource_type="work_order",
        resource_id=wo.id,
        details={"title": wo.title, "status": wo.status, "equipment_id": str(wo.equipment_id)},
        ip_address=get_client_ip(request),
    )
    session.commit()

    assigned_email = None
    if wo.assigned_to_id:
        u = session.get(User, wo.assigned_to_id)
        assigned_email = u.email if u else None
    return _work_order_to_public(session, wo, assigned_to_email=assigned_email)


@router.post("/from-maintenance-event", response_model=WorkOrderDetailPublic)
def create_work_order_from_maintenance_event(
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    body: WorkOrderFromMaintenanceEventCreate,
) -> Any:
    """Создать work order из расчетного события календаря ТО."""
    device = require_canonical_device(session, body.equipment_id)
    equipment_type = str((device.meta or {}).get("kind") or device.device_type)

    if body.assigned_to_id and session.get(User, body.assigned_to_id) is None:
        raise HTTPException(status_code=400, detail="Исполнитель не найден")

    # 1) Conflict-check по overlap (техника/исполнитель).
    assert_no_overlapping_conflicts_or_raise(
        session,
        equipment_id=body.equipment_id,
        assigned_to_id=body.assigned_to_id,
        start_at=body.start_at,
        end_at=body.end_at,
    )

    # 2) Подбор шаблона регламента по типу техники (+ interval_hours).
    template = None
    if body.interval_hours is not None:
        template = session.exec(
            select(MaintenanceReglamentTemplate).where(
                MaintenanceReglamentTemplate.equipment_type == equipment_type,
                MaintenanceReglamentTemplate.interval_hours == body.interval_hours,
            )
        ).first()

    if template is None:
        template = session.exec(
            select(MaintenanceReglamentTemplate).where(
                MaintenanceReglamentTemplate.equipment_type == equipment_type,
                MaintenanceReglamentTemplate.interval_hours.is_(None),
            )
        ).first()

    if template is None:
        raise HTTPException(
            status_code=404,
            detail="Не найден шаблон регламента для типа техники (и интервала, если задан)",
        )

    checklist_rows = list(
        session.exec(
            select(MaintenanceTemplateChecklistItem)
            .where(MaintenanceTemplateChecklistItem.template_id == template.id)
            .order_by(
                MaintenanceTemplateChecklistItem.sort_order.asc(),
                MaintenanceTemplateChecklistItem.id.asc(),
            )
        ).all()
    )

    req_rows = list(
        session.exec(
            select(MaintenanceTemplateSparePartRequirement).where(
                MaintenanceTemplateSparePartRequirement.template_id == template.id
            )
        ).all()
    )

    # 3) Создаём work order.
    status = WORK_ORDER_STATUS_WAITING_PARTS if req_rows else WORK_ORDER_STATUS_OPEN
    interval_suffix = f" ({body.interval_hours} м/ч)" if body.interval_hours is not None else ""
    title = body.title or f"ТО{interval_suffix}"

    wo = WorkOrder(
        equipment_id=body.equipment_id,
        title=title[:256],
        description=body.description,
        status=status,
        priority=WORK_ORDER_PRIORITY_MEDIUM,
        assigned_to_id=body.assigned_to_id,
        start_at=body.start_at,
        end_at=body.end_at,
        due_at=body.start_at,
        created_by_id=current_user.id,
    )
    session.add(wo)
    session.flush()

    hist = WorkOrderStatusHistory(
        work_order_id=wo.id,
        from_status=None,
        to_status=status,
        changed_by_id=current_user.id,
        comment="Создана из «Расписание ТО»",
    )
    session.add(hist)

    for row in checklist_rows:
        session.add(
            WorkOrderChecklistItem(
                work_order_id=wo.id,
                title=row.title[:512],
                sort_order=row.sort_order,
            )
        )

    # 4) Резерв запчастей (с проверкой доступности остатков).
    if req_rows:
        spare_ids = {r.spare_part_id for r in req_rows}
        spares = {
            s.id: s
            for s in session.exec(select(SparePart).where(SparePart.id.in_(spare_ids))).all()
        } if spare_ids else {}

        reserved_by_part: dict[uuid.UUID, int] = {}
        for sid in spare_ids:
            total_reserved = session.exec(
                select(func.coalesce(func.sum(WorkOrderPartReservation.quantity), 0)).where(
                    WorkOrderPartReservation.spare_part_id == sid
                )
            ).one() or 0
            reserved_by_part[sid] = int(total_reserved)

        delta_reserved: dict[uuid.UUID, int] = {}
        for req in req_rows:
            part = spares.get(req.spare_part_id)
            if part is None:
                raise HTTPException(status_code=404, detail="Запчасть не найдена")

            already_reserved = reserved_by_part.get(req.spare_part_id, 0) + delta_reserved.get(req.spare_part_id, 0)
            available = part.quantity - already_reserved

            if req.quantity > available:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Недостаточно для резерва: доступно {available} "
                        f"(остаток {part.quantity}, уже зарезервировано {already_reserved}), "
                        f"запрошено {req.quantity}"
                    ),
                )

            session.add(
                WorkOrderPartReservation(
                    work_order_id=wo.id,
                    spare_part_id=req.spare_part_id,
                    quantity=req.quantity,
                )
            )
            delta_reserved[req.spare_part_id] = delta_reserved.get(req.spare_part_id, 0) + req.quantity

    log_audit(
        session,
        user_id=current_user.id,
        action="work_order.create",
        resource_type="work_order",
        resource_id=wo.id,
        details={"title": wo.title, "status": wo.status, "equipment_id": str(wo.equipment_id)},
        ip_address=get_client_ip(request),
    )
    session.commit()
    # Вернём полный detail, чтобы UI календаря мог сразу открыть drawer.
    return get_work_order(session, current_user, wo.id)


def _get_work_order(session: SessionDep, id: uuid.UUID) -> WorkOrder:
    wo = session.get(WorkOrder, id)
    if not wo:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return wo


@router.get("/{id}", response_model=WorkOrderDetailPublic)
def get_work_order(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    """Получить заявку с историей статусов, комментариями, чек-листом и вложениями."""
    wo = _get_work_order(session, id)
    eq_name = _equipment_name(session, wo.equipment_id)
    assigned_email = None
    if wo.assigned_to_id:
        u = session.get(User, wo.assigned_to_id)
        assigned_email = u.email if u else None

    history = list(
        session.exec(
            select(WorkOrderStatusHistory)
            .where(WorkOrderStatusHistory.work_order_id == id)
            .order_by(WorkOrderStatusHistory.created_at.asc())
        ).all()
    )
    user_ids = {h.changed_by_id for h in history if h.changed_by_id}
    users = {uid: session.get(User, uid) for uid in user_ids}
    status_history_public = [
        WorkOrderStatusHistoryPublic(
            id=h.id,
            work_order_id=h.work_order_id,
            from_status=h.from_status,
            to_status=h.to_status,
            changed_by_id=h.changed_by_id,
            changed_by_email=users.get(h.changed_by_id).email if users.get(h.changed_by_id) else None,
            comment=h.comment,
            created_at=h.created_at,
        )
        for h in history
    ]

    comments = list(
        session.exec(
            select(WorkOrderComment)
            .where(WorkOrderComment.work_order_id == id)
            .order_by(WorkOrderComment.created_at.asc())
        ).all()
    )
    comment_user_ids = {c.user_id for c in comments}
    comment_users = {uid: session.get(User, uid) for uid in comment_user_ids}
    comments_public = [
        WorkOrderCommentPublic(
            id=c.id,
            work_order_id=c.work_order_id,
            user_id=c.user_id,
            user_email=comment_users.get(c.user_id).email if comment_users.get(c.user_id) else None,
            body=c.body,
            created_at=c.created_at,
        )
        for c in comments
    ]

    checklist = list(
        session.exec(
            select(WorkOrderChecklistItem)
            .where(WorkOrderChecklistItem.work_order_id == id)
            .order_by(WorkOrderChecklistItem.sort_order.asc(), WorkOrderChecklistItem.id)
        ).all()
    )
    attachments = list(
        session.exec(
            select(WorkOrderAttachment)
            .where(WorkOrderAttachment.work_order_id == id)
            .order_by(WorkOrderAttachment.created_at.asc())
        ).all()
    )

    part_reservations = list(
        session.exec(
            select(WorkOrderPartReservation)
            .where(WorkOrderPartReservation.work_order_id == id)
            .order_by(WorkOrderPartReservation.created_at.asc())
        ).all()
    )
    spare_ids_res = {r.spare_part_id for r in part_reservations}
    spares_res = {s.id: s for s in session.exec(select(SparePart).where(SparePart.id.in_(spare_ids_res))).all()} if spare_ids_res else {}
    part_reservations_public = [
        WorkOrderPartReservationPublic(
            id=r.id,
            work_order_id=r.work_order_id,
            spare_part_id=r.spare_part_id,
            spare_part_title=spares_res.get(r.spare_part_id).title if spares_res.get(r.spare_part_id) else None,
            spare_part_sku=spares_res.get(r.spare_part_id).sku if spares_res.get(r.spare_part_id) else None,
            quantity=r.quantity,
            created_at=r.created_at,
        )
        for r in part_reservations
    ]

    part_consumptions = list(
        session.exec(
            select(WorkOrderPartConsumption)
            .where(WorkOrderPartConsumption.work_order_id == id)
            .order_by(WorkOrderPartConsumption.consumed_at.asc())
        ).all()
    )
    spare_ids_cons = {c.spare_part_id for c in part_consumptions}
    spares_cons = {s.id: s for s in session.exec(select(SparePart).where(SparePart.id.in_(spare_ids_cons))).all()} if spare_ids_cons else {}
    part_consumptions_public = [
        WorkOrderPartConsumptionPublic(
            id=c.id,
            work_order_id=c.work_order_id,
            spare_part_id=c.spare_part_id,
            spare_part_title=spares_cons.get(c.spare_part_id).title if spares_cons.get(c.spare_part_id) else None,
            spare_part_sku=spares_cons.get(c.spare_part_id).sku if spares_cons.get(c.spare_part_id) else None,
            quantity=c.quantity,
            consumed_at=c.consumed_at,
        )
        for c in part_consumptions
    ]

    base = _work_order_to_public(session, wo, equipment_name_val=eq_name, assigned_to_email=assigned_email)
    return WorkOrderDetailPublic(
        **base.model_dump(),
        status_history=status_history_public,
        comments=comments_public,
        checklist_items=[WorkOrderChecklistItemPublic(
            id=c.id, work_order_id=c.work_order_id, title=c.title, sort_order=c.sort_order, completed=c.completed
        ) for c in checklist],
        attachments=[WorkOrderAttachmentPublic(
            id=a.id, work_order_id=a.work_order_id, file_path=a.file_path, filename=a.filename, kind=a.kind, created_at=a.created_at
        ) for a in attachments],
        part_reservations=part_reservations_public,
        part_consumptions=part_consumptions_public,
    )


@router.put("/{id}", response_model=WorkOrderPublic)
def update_work_order(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    body: WorkOrderUpdate,
) -> Any:
    """Обновить заявку. При смене статуса добавляется запись в историю."""
    wo = _get_work_order(session, id)
    old_status = wo.status
    update_data = body.model_dump(exclude_unset=True)
    status_comment = update_data.pop("status_comment", None)

    if "status" in update_data:
        if update_data["status"] not in WORK_ORDER_STATUSES:
            raise HTTPException(status_code=400, detail="Недопустимый статус")
    if "priority" in update_data and update_data["priority"] not in WORK_ORDER_PRIORITIES:
        raise HTTPException(status_code=400, detail="Недопустимый приоритет")
    if body.assigned_to_id is not None and body.assigned_to_id and session.get(User, body.assigned_to_id) is None:
        raise HTTPException(status_code=400, detail="Исполнитель не найден")

    new_status = update_data.get("status", old_status)

    should_check_conflicts = any(k in update_data for k in ("start_at", "end_at", "assigned_to_id"))
    if should_check_conflicts:
        new_start_at = update_data.get("start_at", wo.start_at)
        new_end_at = update_data.get("end_at", wo.end_at)
        new_assigned_to_id = update_data.get("assigned_to_id", wo.assigned_to_id)
        assert_no_overlapping_conflicts_or_raise(
            session,
            equipment_id=wo.equipment_id,
            assigned_to_id=new_assigned_to_id,
            start_at=new_start_at,
            end_at=new_end_at,
            exclude_work_order_id=wo.id,
        )

    if new_status != old_status:
        hist = WorkOrderStatusHistory(
            work_order_id=wo.id,
            from_status=old_status,
            to_status=new_status,
            changed_by_id=current_user.id,
            comment=status_comment[:1024] if status_comment else None,
        )
        session.add(hist)

    wo.sqlmodel_update(update_data)
    wo.updated_at = datetime.now(timezone.utc)
    session.add(wo)
    session.commit()
    session.refresh(wo)

    assigned_email = None
    if wo.assigned_to_id:
        u = session.get(User, wo.assigned_to_id)
        assigned_email = u.email if u else None
    return _work_order_to_public(session, wo, assigned_to_email=assigned_email)


@router.delete("/{id}", response_model=dict)
def delete_work_order(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    """Удалить заявку."""
    wo = _get_work_order(session, id)
    session.delete(wo)
    session.commit()
    return {"message": "Заявка удалена"}


@router.post("/{id}/comments", response_model=WorkOrderCommentPublic)
def add_comment(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    body: WorkOrderCommentCreate,
) -> Any:
    """Добавить комментарий к заявке."""
    wo = _get_work_order(session, id)
    comment = WorkOrderComment(work_order_id=wo.id, user_id=current_user.id, body=body.body[:4096])
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return WorkOrderCommentPublic(
        id=comment.id,
        work_order_id=comment.work_order_id,
        user_id=comment.user_id,
        user_email=current_user.email,
        body=comment.body,
        created_at=comment.created_at,
    )


@router.get("/{id}/checklist", response_model=list[WorkOrderChecklistItemPublic])
def get_checklist(session: SessionDep, _current_user: CurrentUser, id: uuid.UUID) -> Any:
    wo = _get_work_order(session, id)
    items = list(
        session.exec(
            select(WorkOrderChecklistItem)
            .where(WorkOrderChecklistItem.work_order_id == wo.id)
            .order_by(WorkOrderChecklistItem.sort_order.asc(), WorkOrderChecklistItem.id)
        ).all()
    )
    return [WorkOrderChecklistItemPublic(id=i.id, work_order_id=i.work_order_id, title=i.title, sort_order=i.sort_order, completed=i.completed) for i in items]


@router.post("/{id}/checklist", response_model=WorkOrderChecklistItemPublic)
def add_checklist_item(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
    body: WorkOrderChecklistItemCreate,
) -> Any:
    wo = _get_work_order(session, id)
    max_order = session.exec(
        select(func.coalesce(func.max(WorkOrderChecklistItem.sort_order), -1)).where(
            WorkOrderChecklistItem.work_order_id == wo.id
        )
    ).one()
    item = WorkOrderChecklistItem(
        work_order_id=wo.id,
        title=body.title[:512],
        sort_order=max_order + 1,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return WorkOrderChecklistItemPublic(id=item.id, work_order_id=item.work_order_id, title=item.title, sort_order=item.sort_order, completed=item.completed)


@router.patch("/{id}/checklist/{item_id}", response_model=WorkOrderChecklistItemPublic)
def update_checklist_item(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
    item_id: uuid.UUID,
    body: WorkOrderChecklistItemUpdate,
) -> Any:
    wo = _get_work_order(session, id)
    item = session.get(WorkOrderChecklistItem, item_id)
    if not item or item.work_order_id != wo.id:
        raise HTTPException(status_code=404, detail="Пункт чек-листа не найден")
    update_data = body.model_dump(exclude_unset=True)
    if "title" in update_data:
        item.title = update_data["title"][:512]
    if "completed" in update_data:
        item.completed = update_data["completed"]
    if "sort_order" in update_data:
        item.sort_order = update_data["sort_order"]
    session.add(item)
    session.commit()
    session.refresh(item)
    return WorkOrderChecklistItemPublic(id=item.id, work_order_id=item.work_order_id, title=item.title, sort_order=item.sort_order, completed=item.completed)


@router.delete("/{id}/checklist/{item_id}", response_model=dict)
def delete_checklist_item(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
    item_id: uuid.UUID,
) -> Any:
    wo = _get_work_order(session, id)
    item = session.get(WorkOrderChecklistItem, item_id)
    if not item or item.work_order_id != wo.id:
        raise HTTPException(status_code=404, detail="Пункт чек-листа не найден")
    session.delete(item)
    session.commit()
    return {"message": "Пункт удалён"}


@router.post("/{id}/attachments", response_model=WorkOrderAttachmentPublic)
def add_attachment(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
    body: WorkOrderAttachmentCreate,
) -> Any:
    """Добавить вложение (file_path — путь/URL после загрузки файла)."""
    wo = _get_work_order(session, id)
    kind = body.kind if body.kind in ("before_photo", "after_photo", "attachment") else "attachment"
    att = WorkOrderAttachment(
        work_order_id=wo.id,
        file_path=body.file_path[:1024],
        filename=body.filename[:256] if body.filename else None,
        kind=kind,
    )
    session.add(att)
    session.commit()
    session.refresh(att)
    return WorkOrderAttachmentPublic(id=att.id, work_order_id=att.work_order_id, file_path=att.file_path, filename=att.filename, kind=att.kind, created_at=att.created_at)


# --- Резерв и списание запчастей по заявке ---
@router.get("/{id}/part-reservations", response_model=list[WorkOrderPartReservationPublic])
def list_part_reservations(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    """Список резервов запчастей по заявке."""
    wo = _get_work_order(session, id)
    reservations = list(
        session.exec(
            select(WorkOrderPartReservation)
            .where(WorkOrderPartReservation.work_order_id == wo.id)
            .order_by(WorkOrderPartReservation.created_at.asc())
        ).all()
    )
    spare_ids = {r.spare_part_id for r in reservations}
    spares = {s.id: s for s in session.exec(select(SparePart).where(SparePart.id.in_(spare_ids))).all()} if spare_ids else {}
    return [
        WorkOrderPartReservationPublic(
            id=r.id,
            work_order_id=r.work_order_id,
            spare_part_id=r.spare_part_id,
            spare_part_title=spares.get(r.spare_part_id).title if spares.get(r.spare_part_id) else None,
            spare_part_sku=spares.get(r.spare_part_id).sku if spares.get(r.spare_part_id) else None,
            quantity=r.quantity,
            created_at=r.created_at,
        )
        for r in reservations
    ]


@router.post("/{id}/part-reservations", response_model=WorkOrderPartReservationPublic)
def add_part_reservation(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
    body: WorkOrderPartReservationCreate,
) -> Any:
    """Зарезервировать запчасть под заявку (со склада запчастей)."""
    wo = _get_work_order(session, id)
    part = session.get(SparePart, body.spare_part_id)
    if not part:
        raise HTTPException(status_code=404, detail="Запчасть не найдена")
    total_reserved = session.exec(
        select(func.coalesce(func.sum(WorkOrderPartReservation.quantity), 0)).where(
            WorkOrderPartReservation.spare_part_id == body.spare_part_id
        )
    ).one() or 0
    available = part.quantity - total_reserved
    if body.quantity > available:
        raise HTTPException(
            status_code=400,
            detail=f"Недостаточно для резерва: доступно {available} (остаток {part.quantity}, уже зарезервировано {total_reserved}), запрошено {body.quantity}",
        )
    reservation = WorkOrderPartReservation(
        work_order_id=wo.id,
        spare_part_id=body.spare_part_id,
        quantity=body.quantity,
    )
    session.add(reservation)
    session.commit()
    session.refresh(reservation)
    session.refresh(part)
    return WorkOrderPartReservationPublic(
        id=reservation.id,
        work_order_id=reservation.work_order_id,
        spare_part_id=reservation.spare_part_id,
        spare_part_title=part.title,
        spare_part_sku=part.sku,
        quantity=reservation.quantity,
        created_at=reservation.created_at,
    )


@router.delete("/{id}/part-reservations/{reservation_id}", response_model=dict)
def delete_part_reservation(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
    reservation_id: uuid.UUID,
) -> Any:
    """Снять резерв запчасти по заявке."""
    wo = _get_work_order(session, id)
    res = session.get(WorkOrderPartReservation, reservation_id)
    if not res or res.work_order_id != wo.id:
        raise HTTPException(status_code=404, detail="Резерв не найден")
    session.delete(res)
    session.commit()
    return {"message": "Резерв снят"}


@router.post("/{id}/part-consumption", response_model=WorkOrderPartConsumptionPublic)
def add_part_consumption(
    session: SessionDep,
    _current_user: CurrentUser,
    id: uuid.UUID,
    body: WorkOrderPartConsumptionCreate,
) -> Any:
    """Списать запчасть по заявке (фактическое списание): уменьшает остаток на складе запчастей, при необходимости уменьшает резерв по этой заявке."""
    wo = _get_work_order(session, id)
    part = session.get(SparePart, body.spare_part_id)
    if not part:
        raise HTTPException(status_code=404, detail="Запчасть не найдена")
    if body.quantity > part.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Недостаточно на складе запчастей: остаток {part.quantity}, списать {body.quantity}",
        )
    consumption = WorkOrderPartConsumption(
        work_order_id=wo.id,
        spare_part_id=body.spare_part_id,
        quantity=body.quantity,
    )
    session.add(consumption)
    part.quantity -= body.quantity
    session.add(part)
    reservation = session.exec(
        select(WorkOrderPartReservation)
        .where(
            WorkOrderPartReservation.work_order_id == wo.id,
            WorkOrderPartReservation.spare_part_id == body.spare_part_id,
        )
    ).first()
    if reservation:
        reservation.quantity -= min(reservation.quantity, body.quantity)
        if reservation.quantity <= 0:
            session.delete(reservation)
        else:
            session.add(reservation)
    session.commit()
    session.refresh(consumption)
    session.refresh(part)
    return WorkOrderPartConsumptionPublic(
        id=consumption.id,
        work_order_id=consumption.work_order_id,
        spare_part_id=consumption.spare_part_id,
        spare_part_title=part.title,
        spare_part_sku=part.sku,
        quantity=consumption.quantity,
        consumed_at=consumption.consumed_at,
    )
