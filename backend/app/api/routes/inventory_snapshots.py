from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Query
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models import InventorySnapshot

router = APIRouter(prefix="/inventory-snapshots", tags=["inventory-snapshots"])


@router.get("/")
def get_inventory_snapshots(
    session: SessionDep,
    _current_user: CurrentUser,
    from_date: date = Query(default_factory=lambda: date.today() - timedelta(days=30)),
    to_date: date = Query(default_factory=date.today),
) -> list[dict[str, Any]]:
    dt_from = datetime.combine(from_date, time.min).replace(tzinfo=timezone.utc)
    dt_to = datetime.combine(to_date, time.max).replace(tzinfo=timezone.utc)

    stmt = (
        select(InventorySnapshot)
        .where(
            InventorySnapshot.taken_at >= dt_from,
            InventorySnapshot.taken_at <= dt_to,
        )
        .order_by(InventorySnapshot.taken_at)
    )
    results = session.exec(stmt).all()

    out: list[dict[str, Any]] = []
    for r in results:
        snap: dict[str, Any] = r.snapshot if isinstance(r.snapshot, dict) else {}
        out.append(
            {
                "id": str(r.id),
                "warehouse_id": str(r.warehouse_id),
                "taken_at": r.taken_at.isoformat(),
                "label": r.label,
                "total_items": snap.get("total_items", 0),
                "total_quantity": snap.get("total_quantity", 0),
                "by_status": snap.get("by_status", {}),
            }
        )
    return out
