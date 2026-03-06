"""API расписания ТО: цепочки, шаги, привязка техники, журнал изменений."""
import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.audit import get_client_ip, log_audit
from app.core.permissions import (
    PERM_MAINTENANCE_SCHEDULE_EDIT,
    PERM_MAINTENANCE_SCHEDULE_VIEW,
    can_edit_maintenance_schedule,
    can_view_maintenance_schedule,
)
from app.models import (
    ChainAssignment,
    Equipment,
    MaintenanceChain,
    MaintenanceChainAudit,
    MaintenanceChainCreate,
    MaintenanceChainList,
    MaintenanceChainPublic,
    MaintenanceChainStep,
    MaintenanceChainUpdate,
    MaintenanceChainAuditPublic,
    MaintenanceScheduleConfig,
    MaintenanceScheduleConfigPublic,
    MaintenanceChainImportBody,
    User,
)

router = APIRouter(prefix="/maintenance-schedule", tags=["maintenance-schedule"])

ALLOWED_COLOR_TAGS = {"blue", "purple", "orange", "cyan", "teal", "pink", "violet", "indigo"}
DEFAULT_COLOR = "blue"
DEFAULT_REMIND = 50


def _chain_to_public(
    session: SessionDep,
    chain: MaintenanceChain,
    steps: list[MaintenanceChainStep],
    equipment_ids: list[uuid.UUID],
) -> MaintenanceChainPublic:
    interval_hours = [s.interval_hours for s in sorted(steps, key=lambda x: x.position)]
    return MaintenanceChainPublic(
        id=chain.id,
        name=chain.name,
        color_tag=chain.color_tag or DEFAULT_COLOR,
        remind_before_hours=chain.remind_before_hours,
        interval_hours=interval_hours,
        equipment_ids=equipment_ids,
        created_at=chain.created_at,
        updated_at=chain.updated_at,
    )


def _get_chain_steps(session: SessionDep, chain_id: uuid.UUID) -> list[MaintenanceChainStep]:
    return list(
        session.exec(
            select(MaintenanceChainStep)
            .where(MaintenanceChainStep.chain_id == chain_id)
            .order_by(MaintenanceChainStep.position)
        )
    )


def _get_chain_equipment_ids(session: SessionDep, chain_id: uuid.UUID) -> list[uuid.UUID]:
    rows = session.exec(
        select(ChainAssignment.equipment_id).where(ChainAssignment.chain_id == chain_id)
    ).all()
    return list(rows)


def _log_chain_audit(
    session: SessionDep,
    chain_id: uuid.UUID,
    user_id: uuid.UUID | None,
    action: str,
    old_intervals: list[int] | None = None,
    new_intervals: list[int] | None = None,
    details: str | None = None,
) -> None:
    entry = MaintenanceChainAudit(
        chain_id=chain_id,
        user_id=user_id,
        action=action,
        old_intervals=json.dumps(old_intervals) if old_intervals is not None else None,
        new_intervals=json.dumps(new_intervals) if new_intervals is not None else None,
        details=details,
    )
    session.add(entry)


@router.get("/permissions")
def get_my_permissions(
    session: SessionDep,
    current_user: CurrentUser,
) -> dict:
    """Права текущего пользователя на расписание ТО (для UI: показывать ли кнопки редактирования)."""
    return {
        "can_view": can_view_maintenance_schedule(session, current_user),
        "can_edit": can_edit_maintenance_schedule(session, current_user),
    }


@router.get("/chains", response_model=MaintenanceChainList)
def list_chains(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Список цепочек ТО (просмотр — право maintenance_schedule.view)."""
    if not can_view_maintenance_schedule(session, current_user):
        raise HTTPException(status_code=403, detail="Недостаточно прав для просмотра расписания ТО")
    chains = list(session.exec(select(MaintenanceChain).order_by(MaintenanceChain.name)))
    result = []
    for chain in chains:
        steps = _get_chain_steps(session, chain.id)
        equipment_ids = _get_chain_equipment_ids(session, chain.id)
        result.append(_chain_to_public(session, chain, steps, equipment_ids))
    return MaintenanceChainList(data=result, count=len(result))


@router.get("/chains/{chain_id}", response_model=MaintenanceChainPublic)
def get_chain(
    session: SessionDep,
    current_user: CurrentUser,
    chain_id: uuid.UUID,
) -> Any:
    """Одна цепочка по ID."""
    if not can_view_maintenance_schedule(session, current_user):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    chain = session.get(MaintenanceChain, chain_id)
    if not chain:
        raise HTTPException(status_code=404, detail="Цепочка не найдена")
    steps = _get_chain_steps(session, chain.id)
    equipment_ids = _get_chain_equipment_ids(session, chain.id)
    return _chain_to_public(session, chain, steps, equipment_ids)


@router.get("/config", response_model=MaintenanceScheduleConfigPublic)
def get_config(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Глобальные настройки: доступные интервалы и напоминание по умолчанию."""
    if not can_view_maintenance_schedule(session, current_user):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    intervals_row = session.get(MaintenanceScheduleConfig, "default_intervals")
    remind_row = session.get(MaintenanceScheduleConfig, "default_remind_before_hours")
    default_intervals = [500, 1000, 1500, 2000, 2500]
    default_remind = 50
    if intervals_row and intervals_row.value:
        try:
            default_intervals = json.loads(intervals_row.value)
        except (json.JSONDecodeError, TypeError):
            pass
    if remind_row and remind_row.value:
        try:
            default_remind = int(remind_row.value)
        except (ValueError, TypeError):
            pass
    return MaintenanceScheduleConfigPublic(
        default_intervals=default_intervals,
        default_remind_before_hours=default_remind,
    )


@router.put("/config", response_model=MaintenanceScheduleConfigPublic)
def update_config(
    session: SessionDep,
    current_user: CurrentUser,
    body: MaintenanceScheduleConfigPublic,
) -> Any:
    """Обновить глобальные настройки (право maintenance_schedule.edit)."""
    if not can_edit_maintenance_schedule(session, current_user):
        raise HTTPException(status_code=403, detail="Недостаточно прав для редактирования")
    for key, value in [
        ("default_intervals", json.dumps(body.default_intervals)),
        ("default_remind_before_hours", str(body.default_remind_before_hours)),
    ]:
        row = session.get(MaintenanceScheduleConfig, key)
        if row:
            row.value = value
            session.add(row)
        else:
            session.add(MaintenanceScheduleConfig(key=key, value=value))
    session.commit()
    return get_config(session, current_user)


@router.post(
    "/chains",
    response_model=MaintenanceChainPublic,
    dependencies=[require_permission(PERM_MAINTENANCE_SCHEDULE_EDIT)],
)
def create_chain(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    body: MaintenanceChainCreate,
) -> Any:
    """Создать цепочку ТО."""
    color_tag = body.color_tag if body.color_tag in ALLOWED_COLOR_TAGS else DEFAULT_COLOR
    remind = body.remind_before_hours if body.remind_before_hours is not None else DEFAULT_REMIND
    chain = MaintenanceChain(
        name=body.name.strip(),
        color_tag=color_tag,
        remind_before_hours=remind,
    )
    session.add(chain)
    session.flush()
    for pos, ih in enumerate(body.interval_hours or []):
        if ih > 0:
            session.add(
                MaintenanceChainStep(chain_id=chain.id, position=pos, interval_hours=ih)
            )
    for eid in body.equipment_ids or []:
        if session.get(Equipment, eid):
            session.add(ChainAssignment(chain_id=chain.id, equipment_id=eid))
    _log_chain_audit(
        session,
        chain.id,
        current_user.id,
        "created",
        new_intervals=body.interval_hours or [],
        details=f"Создана цепочка «{chain.name}»",
    )
    log_audit(
        session,
        user_id=current_user.id,
        action="maintenance_chain.create",
        resource_type="maintenance_chain",
        resource_id=chain.id,
        details={"name": chain.name},
        ip_address=get_client_ip(request),
    )
    session.commit()
    session.refresh(chain)
    steps = _get_chain_steps(session, chain.id)
    equipment_ids = _get_chain_equipment_ids(session, chain.id)
    return _chain_to_public(session, chain, steps, equipment_ids)


@router.put(
    "/chains/{chain_id}",
    response_model=MaintenanceChainPublic,
    dependencies=[require_permission(PERM_MAINTENANCE_SCHEDULE_EDIT)],
)
def update_chain(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    chain_id: uuid.UUID,
    body: MaintenanceChainUpdate,
) -> Any:
    """Обновить цепочку ТО (интервалы, название, привязка техники)."""
    chain = session.get(MaintenanceChain, chain_id)
    if not chain:
        raise HTTPException(status_code=404, detail="Цепочка не найдена")
    old_steps = _get_chain_steps(session, chain_id)
    old_intervals = [s.interval_hours for s in sorted(old_steps, key=lambda x: x.position)]

    if body.name is not None:
        chain.name = body.name.strip()
    if body.color_tag is not None and body.color_tag in ALLOWED_COLOR_TAGS:
        chain.color_tag = body.color_tag
    if body.remind_before_hours is not None:
        chain.remind_before_hours = body.remind_before_hours

    if body.interval_hours is not None:
        for s in old_steps:
            session.delete(s)
        for pos, ih in enumerate(body.interval_hours):
            if ih > 0:
                session.add(
                    MaintenanceChainStep(chain_id=chain.id, position=pos, interval_hours=ih)
                )
        _log_chain_audit(
            session,
            chain.id,
            current_user.id,
            "intervals_updated",
            old_intervals=old_intervals,
            new_intervals=body.interval_hours,
        )

    if body.equipment_ids is not None:
        for a in session.exec(select(ChainAssignment).where(ChainAssignment.chain_id == chain_id)):
            session.delete(a)
        for eid in body.equipment_ids:
            if session.get(Equipment, eid):
                session.add(ChainAssignment(chain_id=chain.id, equipment_id=eid))

    log_audit(
        session,
        user_id=current_user.id,
        action="maintenance_chain.update",
        resource_type="maintenance_chain",
        resource_id=chain.id,
        details={"name": chain.name},
        ip_address=get_client_ip(request),
    )
    session.add(chain)
    session.commit()
    session.refresh(chain)
    steps = _get_chain_steps(session, chain.id)
    equipment_ids = _get_chain_equipment_ids(session, chain.id)
    return _chain_to_public(session, chain, steps, equipment_ids)


@router.delete(
    "/chains/{chain_id}",
    dependencies=[require_permission(PERM_MAINTENANCE_SCHEDULE_EDIT)],
)
def delete_chain(
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    chain_id: uuid.UUID,
) -> dict:
    """Удалить цепочку ТО."""
    chain = session.get(MaintenanceChain, chain_id)
    if not chain:
        raise HTTPException(status_code=404, detail="Цепочка не найдена")
    name = chain.name
    session.delete(chain)
    _log_chain_audit(
        session,
        chain_id,
        current_user.id,
        "deleted",
        old_intervals=[],
        details=f"Удалена цепочка «{name}»",
    )
    log_audit(
        session,
        user_id=current_user.id,
        action="maintenance_chain.delete",
        resource_type="maintenance_chain",
        resource_id=chain_id,
        details={"name": name},
        ip_address=get_client_ip(request),
    )
    session.commit()
    return {"message": "Цепочка удалена"}


@router.get("/chains/{chain_id}/history")
def get_chain_history(
    session: SessionDep,
    current_user: CurrentUser,
    chain_id: uuid.UUID,
) -> Any:
    """Журнал изменений цепочки (кто и когда менял интервалы)."""
    if not can_view_maintenance_schedule(session, current_user):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    chain = session.get(MaintenanceChain, chain_id)
    if not chain:
        raise HTTPException(status_code=404, detail="Цепочка не найдена")
    entries = list(
        session.exec(
            select(MaintenanceChainAudit)
            .where(MaintenanceChainAudit.chain_id == chain_id)
            .order_by(MaintenanceChainAudit.created_at.desc())
        )
    )
    result = []
    for e in entries:
        user_email = None
        if e.user_id:
            u = session.get(User, e.user_id)
            if u:
                user_email = u.email
        result.append(
            MaintenanceChainAuditPublic(
                id=e.id,
                chain_id=e.chain_id,
                user_id=e.user_id,
                user_email=user_email,
                action=e.action,
                old_intervals=e.old_intervals,
                new_intervals=e.new_intervals,
                details=e.details,
                created_at=e.created_at,
            )
        )
    return {"data": result, "count": len(result)}


@router.post(
    "/chains/import-from-local",
    dependencies=[require_permission(PERM_MAINTENANCE_SCHEDULE_EDIT)],
)
def import_chains_from_local(
    *,
    session: SessionDep,
    request: Request,
    current_user: CurrentUser,
    body: MaintenanceChainImportBody,
) -> Any:
    """Импорт цепочек из localStorage (миграция при первом входе админа)."""
    if not body.chains:
        return {"imported": 0, "message": "Нет данных для импорта"}
    imported = 0
    for raw in body.chains:
        if not isinstance(raw, dict):
            continue
        name = raw.get("name") or raw.get("name_")
        if not name:
            continue
        name = str(name).strip()
        color_tag = str(raw.get("colorTag", raw.get("color_tag", DEFAULT_COLOR)))
        if color_tag not in ALLOWED_COLOR_TAGS:
            color_tag = DEFAULT_COLOR
        remind = raw.get("remindBeforeHours", raw.get("remind_before_hours", DEFAULT_REMIND))
        if not isinstance(remind, (int, float)) or remind < 0:
            remind = DEFAULT_REMIND
        remind = int(remind)
        interval_hours = raw.get("intervalHours", raw.get("interval_hours", []))
        if not isinstance(interval_hours, list):
            interval_hours = []
        interval_hours = [int(x) for x in interval_hours if isinstance(x, (int, float)) and x > 0]
        equipment_ids = raw.get("equipmentIds", raw.get("equipment_ids", []))
        if not isinstance(equipment_ids, list):
            equipment_ids = []
        eq_uuids = []
        for eid in equipment_ids:
            try:
                uid = uuid.UUID(str(eid)) if eid else None
                if uid and session.get(Equipment, uid):
                    eq_uuids.append(uid)
            except (ValueError, TypeError):
                pass
        chain = MaintenanceChain(name=name, color_tag=color_tag, remind_before_hours=remind)
        session.add(chain)
        session.flush()
        for pos, ih in enumerate(interval_hours):
            session.add(MaintenanceChainStep(chain_id=chain.id, position=pos, interval_hours=ih))
        for eid in eq_uuids:
            session.add(ChainAssignment(chain_id=chain.id, equipment_id=eid))
        _log_chain_audit(
            session,
            chain.id,
            current_user.id,
            "imported",
            new_intervals=interval_hours,
            details=f"Импорт из localStorage: «{name}»",
        )
        imported += 1
    session.commit()
    return {"imported": imported, "message": f"Импортировано цепочек: {imported}"}
