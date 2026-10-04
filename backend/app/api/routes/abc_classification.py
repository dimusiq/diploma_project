"""ABC classification of items by movement frequency."""

from typing import Any

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, SessionDep
from app.services.abc_classification import compute_abc_rows

router = APIRouter(prefix="/abc-classification", tags=["abc-classification"])


@router.get("/")
def get_abc_classification(
    session: SessionDep,
    _current_user: CurrentUser,
    days: int = Query(90, ge=7, le=365, description="Period in days for analysis"),
) -> dict[str, Any]:
    """Compute ABC classification based on item movement frequency."""
    items, summary, total_movements = compute_abc_rows(session, days=days)
    if not items:
        return {"items": [], "summary": summary, "period_days": days}
    return {
        "items": items,
        "summary": summary,
        "total_movements": total_movements,
        "period_days": days,
    }
