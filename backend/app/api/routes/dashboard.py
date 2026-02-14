from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import cast
from sqlalchemy.types import Date
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.permissions import can_see_all_items
from app.models import Item, ItemHistory, User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

LATEST_INCOMING_LIMIT = 5


@router.get("/stats", response_model=dict[str, Any])
def get_dashboard_stats(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Get dashboard statistics for items.
    latest_incoming — последние поступления (с учётом прав: viewer видит только свои).
    """
    # Total items count (with permission: viewer sees only own)
    if can_see_all_items(current_user):
        total_items = session.exec(select(func.count()).select_from(Item)).one()
    else:
        total_items = session.exec(
            select(func.count()).select_from(Item).where(Item.owner_id == current_user.id)
        ).one()

    # Items by status (with permission)
    if can_see_all_items(current_user):
        status_results = session.exec(
            select(Item.status, func.count(Item.id)).group_by(Item.status)
        ).all()
    else:
        status_results = session.exec(
            select(Item.status, func.count(Item.id))
            .where(Item.owner_id == current_user.id)
            .group_by(Item.status)
        ).all()
    status_counts = {status: count for status, count in status_results}

    # Total users (owners of items) — только для тех, кто видит все
    total_users = 0
    if can_see_all_items(current_user):
        total_users = session.exec(select(func.count()).select_from(User)).one()

    # Items per user (top owners) — только для тех, кто видит все
    top_owners: list[dict[str, Any]] = []
    if can_see_all_items(current_user):
        user_item_counts = session.exec(
            select(User.email, func.count(Item.id))
            .join(Item)
            .group_by(User.email)
            .order_by(func.count(Item.id).desc())
            .limit(5)
        ).all()
        top_owners = [
            {"owner_email": email, "item_count": count}
            for email, count in user_item_counts
        ]

    # Последние поступления (5 шт., status=incoming, по created_at desc)
    if can_see_all_items(current_user):
        latest_stmt = (
            select(Item)
            .where(Item.status == "incoming")
            .order_by(Item.created_at.desc())
            .limit(LATEST_INCOMING_LIMIT)
        )
    else:
        latest_stmt = (
            select(Item)
            .where(Item.owner_id == current_user.id, Item.status == "incoming")
            .order_by(Item.created_at.desc())
            .limit(LATEST_INCOMING_LIMIT)
        )
    latest_incoming = list(session.exec(latest_stmt).all())

    return {
        "total_items": total_items,
        "total_users": total_users,
        "status_distribution": status_counts,
        "top_owners": top_owners,
        "latest_incoming": [item.model_dump() for item in latest_incoming],
    }


@router.get("/trends", response_model=dict[str, Any])
def get_dashboard_trends(
    session: SessionDep,
    current_user: CurrentUser,
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    group_by: str = Query("day", regex="^(day|week)$"),
) -> Any:
    """
    Тренды: поступления (создание товара) и отгрузки (переход в shipped) по дням или неделям.
    from, to — границы периода (даты включительно). group_by: day | week.
    """
    # Default period: last 30 days
    today = datetime.now(timezone.utc).date()
    if to_date is None:
        to_date = today
    if from_date is None:
        from_date = today - timedelta(days=30)
    if from_date > to_date:
        from_date, to_date = to_date, from_date

    dt_from = datetime.combine(from_date, time.min).replace(tzinfo=timezone.utc)
    dt_to = datetime.combine(to_date, time.max).replace(tzinfo=timezone.utc)

    if group_by == "week":
        # date_trunc('week', ts) returns Monday 00:00; cast to date for grouping
        date_expr = func.date_trunc("week", Item.created_at)
        date_expr_hist = func.date_trunc("week", ItemHistory.changed_at)
    else:
        date_expr = cast(Item.created_at, Date)
        date_expr_hist = cast(ItemHistory.changed_at, Date)

    # Incoming: count items created per period (with permission filter)
    if can_see_all_items(current_user):
        incoming_stmt = (
            select(date_expr.label("period"), func.count(Item.id).label("count"))
            .where(Item.created_at >= dt_from, Item.created_at <= dt_to)
            .group_by(date_expr)
            .order_by(date_expr)
        )
    else:
        incoming_stmt = (
            select(date_expr.label("period"), func.count(Item.id).label("count"))
            .where(
                Item.owner_id == current_user.id,
                Item.created_at >= dt_from,
                Item.created_at <= dt_to,
            )
            .group_by(date_expr)
            .order_by(date_expr)
        )
    incoming_rows = session.exec(incoming_stmt).all()

    # Shipped: from ItemHistory where field_name='status' and new_value='shipped'
    if can_see_all_items(current_user):
        shipped_stmt = (
            select(date_expr_hist.label("period"), func.count(ItemHistory.id).label("count"))
            .where(
                ItemHistory.field_name == "status",
                ItemHistory.new_value == "shipped",
                ItemHistory.changed_at >= dt_from,
                ItemHistory.changed_at <= dt_to,
            )
            .group_by(date_expr_hist)
            .order_by(date_expr_hist)
        )
    else:
        shipped_stmt = (
            select(date_expr_hist.label("period"), func.count(ItemHistory.id).label("count"))
            .join(Item, ItemHistory.item_id == Item.id)
            .where(
                Item.owner_id == current_user.id,
                ItemHistory.field_name == "status",
                ItemHistory.new_value == "shipped",
                ItemHistory.changed_at >= dt_from,
                ItemHistory.changed_at <= dt_to,
            )
            .group_by(date_expr_hist)
            .order_by(date_expr_hist)
        )
    shipped_rows = session.exec(shipped_stmt).all()

    def _serialize_period(period: Any) -> str:
        if hasattr(period, "isoformat"):
            return period.isoformat()[:10] if isinstance(period, datetime) else str(period)
        return str(period)

    return {
        "from": from_date.isoformat(),
        "to": to_date.isoformat(),
        "group_by": group_by,
        "incoming": [{"period": _serialize_period(p), "count": c} for p, c in incoming_rows],
        "shipped": [{"period": _serialize_period(p), "count": c} for p, c in shipped_rows],
    }
