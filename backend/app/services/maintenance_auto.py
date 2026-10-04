"""
Авто-постановка нарядов ТО по моточасам (просрочка календаря → WorkOrder + уведомление).

Использует ту же логику overdue, что `maintenance_calendar_query`.
Идемпотентно: повторный sync не плодит дубликаты открытых нарядов.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session, col, select

from app.models import (
    NOTIFICATION_SEVERITY_CRITICAL,
    WORK_ORDER_PRIORITY_MEDIUM,
    WORK_ORDER_STATUS_CANCELED,
    WORK_ORDER_STATUS_DONE,
    WORK_ORDER_STATUS_OPEN,
    Notification,
    WorkOrder,
    WorkOrderStatusHistory,
)
from app.services.maintenance_calendar_query import (
    build_maintenance_calendar_event_list,
)
from app.services.notification_service import (
    OVERDUE_MAINTENANCE_TYPE,
    create_notification,
)

OPEN_WO_STATUSES = frozenset({"open", "in_progress", "waiting_parts"})
AUTO_MARKER_PREFIX = "auto_to:"


def auto_to_marker(*, interval_hours: int, next_at: int) -> str:
    return f"{AUTO_MARKER_PREFIX}interval={interval_hours}:next_at={next_at}"


def _marker_in_description(description: str | None, marker: str) -> bool:
    return bool(description and marker in description)


def has_open_auto_work_order(
    session: Session,
    *,
    equipment_id: uuid.UUID,
    marker: str,
) -> bool:
    rows = session.exec(
        select(WorkOrder).where(
            WorkOrder.equipment_id == equipment_id,
            col(WorkOrder.status).in_(list(OPEN_WO_STATUSES)),
        )
    ).all()
    return any(_marker_in_description(wo.description, marker) for wo in rows)


def create_auto_maintenance_work_order(
    session: Session,
    *,
    equipment_id: uuid.UUID,
    equipment_name: str,
    interval_hours: int,
    engine_hours: int,
    next_service_at_hours: int,
    actor_user_id: uuid.UUID | None = None,
) -> WorkOrder:
    """Создаёт открытый наряд планового ТО. Не коммитит."""
    marker = auto_to_marker(
        interval_hours=interval_hours, next_at=next_service_at_hours
    )
    title = f"Плановое ТО ({interval_hours} м/ч): {equipment_name}"[:256]
    description = (
        f"{marker}\n"
        f"Автосоздание: наработка {engine_hours} м/ч "
        f"достигла порога {next_service_at_hours} м/ч "
        f"(интервал {interval_hours})."
    )[:4096]
    now = datetime.now(timezone.utc)
    wo = WorkOrder(
        equipment_id=equipment_id,
        title=title,
        description=description,
        status=WORK_ORDER_STATUS_OPEN,
        priority=WORK_ORDER_PRIORITY_MEDIUM,
        due_at=now,
        created_by_id=actor_user_id,
        created_at=now,
        updated_at=now,
    )
    session.add(wo)
    session.flush()
    session.add(
        WorkOrderStatusHistory(
            work_order_id=wo.id,
            from_status=None,
            to_status=WORK_ORDER_STATUS_OPEN,
            changed_by_id=actor_user_id,
            comment="Автосоздание по просрочке моточасов",
        )
    )
    return wo


def ensure_overdue_notification_for_device(
    session: Session,
    *,
    user_id: uuid.UUID,
    equipment_id: uuid.UUID,
    equipment_name: str,
    engine_hours: int,
    next_service_at_hours: int,
) -> Notification | None:
    """Одно уведомление на пару (user, device). Не коммитит."""
    existing = session.exec(
        select(Notification).where(
            Notification.user_id == user_id,
            Notification.type == OVERDUE_MAINTENANCE_TYPE,
            Notification.entity_id == equipment_id,
        )
    ).first()
    if existing:
        return None
    return create_notification(
        session,
        user_id,
        type=OVERDUE_MAINTENANCE_TYPE,
        severity=NOTIFICATION_SEVERITY_CRITICAL,
        title=f"Просрочено ТО: {equipment_name}",
        body=(
            f"Наработка {engine_hours} м/ч, порог ТО {next_service_at_hours} м/ч. "
            f"Создан или ожидает наряд ТО."
        ),
        source="График ТО",
        entity_type="equipment",
        entity_id=equipment_id,
    )


def sync_overdue_maintenance(
    session: Session,
    *,
    actor_user_id: uuid.UUID | None = None,
    notify_user_id: uuid.UUID | None = None,
    limit: int = 500,
) -> dict[str, Any]:
    """
    Для всех overdue-событий календаря: создать наряд (если нет открытого)
    и опционально уведомить пользователя. Не коммитит.
    """
    events = build_maintenance_calendar_event_list(
        session, status="overdue", limit=limit
    )
    created_wo: list[str] = []
    skipped: list[str] = []
    notifications = 0

    for ev in events.data:
        marker = auto_to_marker(
            interval_hours=int(ev.interval_hours),
            next_at=int(ev.next_service_at_hours or 0),
        )
        if has_open_auto_work_order(
            session, equipment_id=ev.equipment_id, marker=marker
        ):
            skipped.append(str(ev.equipment_id))
        else:
            # Также не плодить, если уже есть любой открытый WO на эту технику
            # с тем же интервалом в title (ручной из календаря).
            any_open = session.exec(
                select(WorkOrder).where(
                    WorkOrder.equipment_id == ev.equipment_id,
                    col(WorkOrder.status).notin_(
                        [WORK_ORDER_STATUS_DONE, WORK_ORDER_STATUS_CANCELED]
                    ),
                    col(WorkOrder.title).contains(f"{ev.interval_hours} м/ч"),
                )
            ).first()
            if any_open is not None:
                skipped.append(str(ev.equipment_id))
            else:
                wo = create_auto_maintenance_work_order(
                    session,
                    equipment_id=ev.equipment_id,
                    equipment_name=ev.equipment_name
                    or canonical_device_name_fallback(ev.equipment_id),
                    interval_hours=int(ev.interval_hours),
                    engine_hours=int(ev.engine_hours or 0),
                    next_service_at_hours=int(ev.next_service_at_hours or 0),
                    actor_user_id=actor_user_id,
                )
                created_wo.append(str(wo.id))

        if notify_user_id is not None:
            note = ensure_overdue_notification_for_device(
                session,
                user_id=notify_user_id,
                equipment_id=ev.equipment_id,
                equipment_name=ev.equipment_name or str(ev.equipment_id)[:8],
                engine_hours=int(ev.engine_hours or 0),
                next_service_at_hours=int(ev.next_service_at_hours or 0),
            )
            if note is not None:
                notifications += 1

    return {
        "overdue": len(events.data),
        "work_orders_created": len(created_wo),
        "work_order_ids": created_wo,
        "skipped": skipped,
        "notifications_created": notifications,
    }


def notify_maintenance_viewers_overdue(session: Session) -> int:
    """Разослать overdue-уведомления пользователям с правом просмотра графика ТО."""
    from app.core.permissions import can_view_maintenance_schedule
    from app.models import User
    from app.services.notification_service import (
        ensure_overdue_maintenance_notification,
    )

    users = list(
        session.exec(
            select(User).where(
                col(User.is_active).is_(True),
                col(User.deleted_at).is_(None),
            )
        ).all()
    )
    notified = 0
    for user in users:
        if not can_view_maintenance_schedule(session, user):
            continue
        # ensure сам коммитит при создании уведомлений.
        ensure_overdue_maintenance_notification(session, user.id)
        notified += 1
    return notified


def run_maintenance_auto_tick(session: Session) -> dict[str, Any]:
    """
    Тик воркера: создать наряды по overdue, затем уведомить зрителей графика ТО.
    """
    stats = sync_overdue_maintenance(session, actor_user_id=None, notify_user_id=None)
    if stats["work_orders_created"]:
        session.commit()
    viewers = notify_maintenance_viewers_overdue(session)
    return {**stats, "viewers_notified": viewers}


def canonical_device_name_fallback(equipment_id: uuid.UUID) -> str:
    return f"Техника {str(equipment_id)[:8]}"
