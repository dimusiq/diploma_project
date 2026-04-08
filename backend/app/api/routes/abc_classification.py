"""ABC classification of items by movement frequency."""

from typing import Any
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Query
from sqlmodel import select, func, col
from sqlalchemy import desc

from app.api.deps import CurrentUser, SessionDep
from app.models import Item, ItemHistory

router = APIRouter(prefix="/abc-classification", tags=["abc-classification"])


@router.get("/")
def get_abc_classification(
    session: SessionDep,
    _current_user: CurrentUser,
    days: int = Query(90, ge=7, le=365, description="Period in days for analysis"),
) -> dict[str, Any]:
    """Compute ABC classification based on item movement frequency."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    stmt = (
        select(
            ItemHistory.item_id,
            func.count(ItemHistory.id).label("movement_count"),
        )
        .where(col(ItemHistory.changed_at) >= cutoff)
        .group_by(ItemHistory.item_id)
        .order_by(desc("movement_count"))
    )
    rows = session.exec(stmt).all()

    if not rows:
        return {"items": [], "summary": {"A": 0, "B": 0, "C": 0}, "period_days": days}

    total_movements = sum(r.movement_count for r in rows)

    result = []
    cumulative = 0
    a_count = b_count = c_count = 0

    for row in rows:
        cumulative += row.movement_count
        pct = cumulative / total_movements

        if pct <= 0.80:
            cls = "A"
            a_count += 1
        elif pct <= 0.95:
            cls = "B"
            b_count += 1
        else:
            cls = "C"
            c_count += 1

        item = session.get(Item, row.item_id)
        result.append({
            "item_id": str(row.item_id),
            "title": item.title if item else "Unknown",
            "sku": item.sku if item else None,
            "movement_count": row.movement_count,
            "cumulative_pct": round(pct * 100, 1),
            "abc_class": cls,
        })

    return {
        "items": result,
        "summary": {"A": a_count, "B": b_count, "C": c_count},
        "total_movements": total_movements,
        "period_days": days,
    }
