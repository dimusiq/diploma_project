"""API журнала аудита (критичные действия администраторов)."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlmodel import func, select

from app.api.deps import SessionDep, require_permission
from app.core.permissions import PERM_AUDIT_READ
from app.models import AuditLog, AuditLogList, AuditLogPublic, User

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/", response_model=AuditLogList)
def read_audit_log(
    session: SessionDep,
    _dummy: Any = require_permission(PERM_AUDIT_READ),
    skip: int = 0,
    limit: int = Query(100, le=500),
    resource_type: str | None = Query(None, description="Фильтр по типу ресурса"),
    user_id: uuid.UUID | None = Query(None, description="Фильтр по пользователю"),
) -> Any:
    """Список записей аудита с пагинацией."""
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    count_stmt = select(func.count()).select_from(AuditLog)
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
        count_stmt = count_stmt.where(AuditLog.resource_type == resource_type)
    if user_id is not None:
        stmt = stmt.where(AuditLog.user_id == user_id)
        count_stmt = count_stmt.where(AuditLog.user_id == user_id)
    count = session.exec(count_stmt).one()
    stmt = stmt.offset(skip).limit(limit)
    rows = list(session.exec(stmt).all())
    user_ids = {r.user_id for r in rows if r.user_id}
    users_map = {}
    if user_ids:
        users = session.exec(select(User).where(User.id.in_(user_ids))).all()
        users_map = {u.id: u.email for u in users}
    return AuditLogList(
        data=[
            AuditLogPublic(
                id=r.id,
                user_id=r.user_id,
                user_email=users_map.get(r.user_id) if r.user_id else None,
                action=r.action,
                resource_type=r.resource_type,
                resource_id=r.resource_id,
                details=r.details,
                ip_address=r.ip_address,
                created_at=r.created_at,
            )
            for r in rows
        ],
        count=count,
    )
