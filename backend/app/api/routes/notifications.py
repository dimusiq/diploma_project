"""API центра уведомлений: список, счётчик непрочитанных, отметка прочитанным."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import update
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.permissions import can_see_all_items, can_view_maintenance_schedule
from app.models import (
    NOTIFICATION_SEVERITIES,
    Notification,
    NotificationList,
    NotificationPublic,
)
from app.realtime.notification_sse_hub import (
    notification_sse_stream,
    publish_notifications_updated,
)
from app.services.notification_service import (
    ensure_overdue_maintenance_notification,
    ensure_system_notifications,
    ensure_twin_notifications,
    ensure_warehouse_notifications,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/stream")
async def notifications_sse(current_user: CurrentUser) -> StreamingResponse:
    """SSE: события об изменении уведомлений (data JSON с полем type). Heartbeat — comment ping."""
    return StreamingResponse(
        notification_sse_stream(current_user.id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/ensure")
def ensure_notifications(
    session: SessionDep,
    current_user: CurrentUser,
) -> dict:
    """Проверить и создать недостающие уведомления (ТО, склад). Вызывать при открытии панели уведомлений."""
    if can_view_maintenance_schedule(session, current_user):
        ensure_overdue_maintenance_notification(session, current_user.id)
    ensure_warehouse_notifications(
        session, current_user.id, can_see_all_items(session, current_user)
    )
    ensure_twin_notifications(session, current_user.id)
    ensure_system_notifications(session, current_user.id)
    publish_notifications_updated(current_user.id)
    return {"message": "ok"}


@router.get("/unread-count")
def get_unread_count(
    session: SessionDep,
    current_user: CurrentUser,
) -> dict:
    """Количество непрочитанных уведомлений текущего пользователя."""
    count = session.exec(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
            Notification.archived_at.is_(None),
        )
    ).one()
    return {"count": count}


@router.get("/", response_model=NotificationList)
def list_notifications(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    unread_only: bool = Query(False),
    severity: str | None = Query(None),
    type: str | None = Query(None, description="Фильтр по типу уведомления"),
) -> NotificationList:
    """Список уведомлений текущего пользователя. Только свои."""
    statement = select(Notification).where(
        Notification.user_id == current_user.id,
        Notification.archived_at.is_(None),
    )
    count_statement = select(func.count()).select_from(Notification).where(
        Notification.user_id == current_user.id,
        Notification.archived_at.is_(None),
    )

    if unread_only:
        statement = statement.where(Notification.is_read.is_(False))
        count_statement = count_statement.where(Notification.is_read.is_(False))
    if severity and severity in NOTIFICATION_SEVERITIES:
        statement = statement.where(Notification.severity == severity)
        count_statement = count_statement.where(Notification.severity == severity)
    if type:
        statement = statement.where(Notification.type == type)
        count_statement = count_statement.where(Notification.type == type)

    statement = statement.order_by(Notification.created_at.desc())
    count = session.exec(count_statement).one()
    statement = statement.offset(skip).limit(limit)
    items = list(session.exec(statement).all())

    return NotificationList(
        data=[NotificationPublic.model_validate(n) for n in items],
        count=count,
    )


@router.post("/{id}/read")
def mark_notification_read(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> dict:
    """Отметить уведомление как прочитанное."""
    notification = session.get(Notification, id)
    if not notification:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    if notification.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа")
    notification.is_read = True
    notification.read_at = datetime.now(timezone.utc)
    session.add(notification)
    session.commit()
    publish_notifications_updated(current_user.id)
    return {"message": "ok"}


@router.post("/read-all")
def mark_all_read(
    session: SessionDep,
    current_user: CurrentUser,
) -> dict:
    """Отметить все уведомления пользователя как прочитанные (один массовый UPDATE)."""
    now = datetime.now(timezone.utc)
    stmt = (
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True, read_at=now)
    )
    result = session.execute(stmt)
    session.commit()
    marked = result.rowcount if result.rowcount is not None else 0
    publish_notifications_updated(current_user.id)
    return {"message": "ok", "marked": marked}


@router.delete("/")
def clear_all_notifications(
    session: SessionDep,
    current_user: CurrentUser,
) -> dict:
    """
    Скрыть (архивировать) все уведомления текущего пользователя.

    Важно: не удаляем из БД, чтобы /ensure не создавал те же уведомления заново после refresh.
    """
    now = datetime.now(timezone.utc)
    stmt = (
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.archived_at.is_(None),
        )
        .values(archived_at=now, is_read=True, read_at=now)
    )
    result = session.execute(stmt)
    session.commit()
    archived = result.rowcount if result.rowcount is not None else 0
    publish_notifications_updated(current_user.id)
    return {"message": "ok", "archived": archived}
