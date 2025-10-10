from typing import Any

from fastapi import APIRouter, Depends
from sqlmodel import func, select

from app.api.deps import SessionDep
from app.models import Item, User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=dict[str, Any])
def get_dashboard_stats(session: SessionDep) -> Any:
    """
    Get dashboard statistics for items.
    """
    # Total items count
    total_items = session.exec(select(func.count()).select_from(Item)).one()

    # Items by status
    status_counts = {}
    status_results = session.exec(
        select(Item.status, func.count(Item.id)).group_by(Item.status)
    ).all()
    for status, count in status_results:
        status_counts[status] = count

    # Total users (owners of items)
    total_users = session.exec(select(func.count()).select_from(User)).one()

    # Items per user (top owners)
    user_item_counts = session.exec(
        select(User.email, func.count(Item.id))
        .join(Item)
        .group_by(User.email)
        .order_by(func.count(Item.id).desc())
        .limit(5)
    ).all()

    return {
        "total_items": total_items,
        "total_users": total_users,
        "status_distribution": status_counts,
        "top_owners": [
            {"owner_email": email, "item_count": count}
            for email, count in user_item_counts
        ],
    }
