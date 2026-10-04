"""ABC-классификация по частоте движений (ItemHistory)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import desc
from sqlmodel import Session, col, func, select

from app.models import Item, ItemHistory


def compute_abc_rows(
    session: Session, *, days: int = 90
) -> tuple[list[dict[str, Any]], dict[str, int], int]:
    """
    Возвращает (items, summary, total_movements).
    A — до 80% кумулятивных движений, B — до 95%, остальное C.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = (
        select(
            ItemHistory.item_id,
            func.count(col(ItemHistory.id)).label("movement_count"),
        )
        .where(col(ItemHistory.changed_at) >= cutoff)
        .group_by(col(ItemHistory.item_id))
        .order_by(desc("movement_count"))
    )
    raw_rows = session.exec(stmt).all()
    pairs: list[tuple[UUID, int]] = [
        (UUID(str(r[0])), int(r[1])) for r in raw_rows if r[0] is not None
    ]
    if not pairs:
        return [], {"A": 0, "B": 0, "C": 0}, 0

    total_movements = sum(count for _, count in pairs)
    result: list[dict[str, Any]] = []
    cumulative = 0
    a_count = b_count = c_count = 0

    for item_id, movement_count in pairs:
        cumulative += movement_count
        pct = cumulative / total_movements if total_movements else 1.0
        if pct <= 0.80:
            cls = "A"
            a_count += 1
        elif pct <= 0.95:
            cls = "B"
            b_count += 1
        else:
            cls = "C"
            c_count += 1

        item = session.get(Item, item_id)
        result.append(
            {
                "item_id": str(item_id),
                "title": item.title if item else "Unknown",
                "sku": item.sku if item else None,
                "movement_count": movement_count,
                "cumulative_pct": round(pct * 100, 1),
                "abc_class": cls,
            }
        )

    return result, {"A": a_count, "B": b_count, "C": c_count}, total_movements


def abc_class_by_sku(session: Session, *, days: int = 90) -> dict[str, str]:
    """SKU → лучший (A>B>C) класс среди item_id с этим SKU."""
    items, _, _ = compute_abc_rows(session, days=days)
    rank = {"A": 0, "B": 1, "C": 2}
    out: dict[str, str] = {}
    for row in items:
        sku = row.get("sku")
        if not sku:
            continue
        key = str(sku).strip()
        prev = out.get(key)
        cls = str(row["abc_class"])
        if prev is None or rank.get(cls, 9) < rank.get(prev, 9):
            out[key] = cls
    return out


def abc_class_for_item_id(
    session: Session, item_id: UUID, *, days: int = 90
) -> str | None:
    items, _, _ = compute_abc_rows(session, days=days)
    for row in items:
        if row["item_id"] == str(item_id):
            return str(row["abc_class"])
    return None
