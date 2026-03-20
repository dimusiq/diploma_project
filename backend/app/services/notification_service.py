"""
Хелпер для создания уведомлений. Вызывается из генераторов (cron, обработчики API).
Дедупликация и cooldown — при необходимости реализовать в вызывающем коде.
"""
import json
import math
import uuid
from datetime import date, timedelta
from typing import TYPE_CHECKING

from sqlmodel import select

from app.models import (
    NOTIFICATION_SEVERITY_CRITICAL,
    NOTIFICATION_SEVERITY_INFO,
    NOTIFICATION_SEVERITY_WARNING,
    ChainAssignment,
    Equipment,
    Item,
    MaintenanceChainStep,
    MaintenanceScheduleConfig,
    Notification,
    UserCommunicationPreference,
)
from app.realtime.notification_sse_hub import publish_notifications_updated

if TYPE_CHECKING:
    from sqlmodel import Session

OVERDUE_MAINTENANCE_TYPE = "overdue_maintenance"
EXPIRED_ITEM_TYPE = "expired_item"
EXPIRING_SOON_ITEM_TYPE = "expiring_soon_item"
WAREHOUSE_EXPIRING_DAYS = 14


def _in_app_enabled(session: "Session", user_id: uuid.UUID, notification_type: str) -> bool:
    """Возвращает, включён ли данный тип уведомлений в приложении для пользователя (дефолт: True)."""
    row = session.exec(
        select(UserCommunicationPreference)
        .where(
            UserCommunicationPreference.user_id == user_id,
            UserCommunicationPreference.kind == "notification",
            UserCommunicationPreference.key == notification_type,
        )
        .limit(1)
    ).first()
    if not row:
        return True
    return bool(row.in_app_enabled)


def _default_interval(session: "Session") -> int:
    row = session.get(MaintenanceScheduleConfig, "default_intervals")
    if row and row.value:
        try:
            arr = json.loads(row.value)
            if isinstance(arr, list) and arr:
                return int(arr[0])
        except (ValueError, TypeError):
            pass
    return 500


def _interval_for_equipment(session: "Session", equipment_id: uuid.UUID) -> int:
    """Интервал ТО (м/ч) для единицы техники: первый шаг цепочки или default."""
    assignment = session.exec(
        select(ChainAssignment).where(ChainAssignment.equipment_id == equipment_id).limit(1)
    ).first()
    if not assignment:
        return _default_interval(session)
    first_step = session.exec(
        select(MaintenanceChainStep)
        .where(MaintenanceChainStep.chain_id == assignment.chain_id)
        .order_by(MaintenanceChainStep.position)
        .limit(1)
    ).first()
    if first_step:
        return first_step.interval_hours
    return _default_interval(session)


def _get_overdue_equipment(session: "Session") -> list[Equipment]:
    """Список единиц техники с просроченным ТО (логика как на фронте)."""
    result = []
    for eq in session.exec(select(Equipment)).all():
        if eq.engine_hours is None:
            continue
        interval = _interval_for_equipment(session, eq.id)
        next_at = math.ceil(eq.engine_hours / interval) * interval
        if eq.engine_hours >= next_at:
            result.append(eq)
    return result


def ensure_overdue_maintenance_notification(session: "Session", user_id: uuid.UUID) -> None:
    """
    Для каждой единицы техники с просроченным ТО создаёт уведомление единожды: только если
    по этой технике для этого пользователя ещё не создавали уведомление (никакое, в любой момент).
    Повторно уведомления не создаются.
    """
    overdue_list = _get_overdue_equipment(session)
    if not overdue_list:
        return
    if not _in_app_enabled(session, user_id, OVERDUE_MAINTENANCE_TYPE):
        return
    created_any = False
    for eq in overdue_list:
        existing = session.exec(
            select(Notification).where(
                Notification.user_id == user_id,
                Notification.type == OVERDUE_MAINTENANCE_TYPE,
                Notification.entity_id == eq.id,
            )
        ).first()
        if existing:
            continue
        interval = _interval_for_equipment(session, eq.id)
        next_at = math.ceil(eq.engine_hours / interval) * interval
        title = f"Просрочено ТО: {eq.garage_number or eq.model}"
        if eq.garage_number and eq.model:
            title = f"Просрочено ТО: {eq.garage_number} — {eq.model}"
        body = f"Наработка {eq.engine_hours} м/ч, порог ТО {next_at} м/ч. Откройте «Расписание ТО»."
        create_notification(
            session,
            user_id,
            type=OVERDUE_MAINTENANCE_TYPE,
            severity=NOTIFICATION_SEVERITY_CRITICAL,
            title=title,
            body=body,
            source="График ТО",
            entity_type="equipment",
            entity_id=eq.id,
        )
        created_any = True
    if created_any:
        session.commit()
        publish_notifications_updated(user_id)


def _get_items_for_warehouse_notifications(
    session: "Session", user_id: uuid.UUID, can_see_all_items: bool
) -> tuple[list[Item], list[Item]]:
    """Возвращает (просроченные, скоро истекающие) товары для пользователя."""
    today = date.today()
    expiry_limit = today + timedelta(days=WAREHOUSE_EXPIRING_DAYS)
    stmt = select(Item).where(Item.expires_at.is_not(None))
    if not can_see_all_items:
        stmt = stmt.where(Item.owner_id == user_id)
    items = list(session.exec(stmt).all())
    expired = [i for i in items if i.expires_at < today]
    expiring_soon = [i for i in items if today <= i.expires_at <= expiry_limit]
    return (expired, expiring_soon)


def ensure_warehouse_notifications(
    session: "Session", user_id: uuid.UUID, can_see_all_items: bool
) -> None:
    """
    Создаёт уведомления по складу: просроченные продукты (critical) и приближающийся срок
    годности (warning). Один раз на событие: не создаёт повторно по тому же товару.
    """
    expired, expiring_soon = _get_items_for_warehouse_notifications(
        session, user_id, can_see_all_items
    )
    created_any = False
    expired_enabled = _in_app_enabled(session, user_id, EXPIRED_ITEM_TYPE)
    expiring_enabled = _in_app_enabled(session, user_id, EXPIRING_SOON_ITEM_TYPE)
    for item in expired:
        if not expired_enabled:
            break
        existing = session.exec(
            select(Notification).where(
                Notification.user_id == user_id,
                Notification.type == EXPIRED_ITEM_TYPE,
                Notification.entity_id == item.id,
            )
        ).first()
        if existing:
            continue
        title = f"Просрочен срок годности: {item.title}"
        body = f"Срок годности истёк {item.expires_at.isoformat()}. Откройте «Склад»."
        create_notification(
            session,
            user_id,
            type=EXPIRED_ITEM_TYPE,
            severity=NOTIFICATION_SEVERITY_CRITICAL,
            title=title,
            body=body,
            source="Склад",
            entity_type="item",
            entity_id=item.id,
        )
        created_any = True
    for item in expiring_soon:
        if not expiring_enabled:
            break
        existing = session.exec(
            select(Notification).where(
                Notification.user_id == user_id,
                Notification.type == EXPIRING_SOON_ITEM_TYPE,
                Notification.entity_id == item.id,
            )
        ).first()
        if existing:
            continue
        title = f"Скоро истекает срок годности: {item.title}"
        body = f"Срок годности до {item.expires_at.isoformat()}. Откройте «Склад»."
        create_notification(
            session,
            user_id,
            type=EXPIRING_SOON_ITEM_TYPE,
            severity=NOTIFICATION_SEVERITY_WARNING,
            title=title,
            body=body,
            source="Склад",
            entity_type="item",
            entity_id=item.id,
        )
        created_any = True
    if created_any:
        session.commit()
        publish_notifications_updated(user_id)


def create_notification(
    session: "Session",
    user_id: uuid.UUID,
    *,
    type: str,
    severity: str = NOTIFICATION_SEVERITY_INFO,
    title: str,
    body: str | None = None,
    source: str | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
) -> Notification:
    """Создать уведомление для пользователя. session.add не вызывается — вызывающий делает commit."""
    notification = Notification(
        user_id=user_id,
        type=type,
        severity=severity,
        title=title,
        body=body,
        source=source,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    session.add(notification)
    return notification
