from typing import Any

from fastapi import APIRouter
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.permissions import can_see_all_items
from app.models import Item, User

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
