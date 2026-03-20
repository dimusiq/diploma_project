"""Сборка read-only контекста склада для LLM (без RAG; только агрегаты и layout)."""

from __future__ import annotations

from sqlmodel import Session, func, select

from app.core.permissions import can_see_all_items
from app.models import Item, User, WarehouseLayout, WarehouseSlotOccupancy


def build_warehouse_context_for_user(session: Session, user: User) -> str:
    """Текстовый блок фактов, видимых пользователю (те же границы, что у списка товаров)."""
    lines: list[str] = []

    layout = session.exec(
        select(WarehouseLayout).where(WarehouseLayout.is_active.is_(True))
    ).first()
    if layout:
        spec = layout.spec
        lines.append(
            f"Активный layout склада: code={layout.code}, version={layout.version}, "
            f"rows={spec.get('rows')}, levels={spec.get('levels')}, "
            f"cellX={spec.get('cellX')}, cellZ={spec.get('cellZ')}."
        )
    else:
        lines.append("Активный layout склада в системе не задан.")

    see_all = can_see_all_items(session, user)
    item_stmt = select(func.count()).select_from(Item)
    if not see_all:
        item_stmt = item_stmt.where(Item.owner_id == user.id)
    total_items = session.exec(item_stmt).one()

    wh_stmt = select(func.count()).select_from(Item).where(Item.status == "warehouse")
    if not see_all:
        wh_stmt = wh_stmt.where(Item.owner_id == user.id)
    on_warehouse = session.exec(wh_stmt).one()

    placed_stmt = select(func.count()).select_from(Item).where(
        Item.storage_row.is_not(None),
        Item.storage_level.is_not(None),
        Item.storage_cell_x.is_not(None),
        Item.storage_cell_z.is_not(None),
    )
    if not see_all:
        placed_stmt = placed_stmt.where(Item.owner_id == user.id)
    with_cell = session.exec(placed_stmt).one()

    lines.append(
        f"Товары (в пределах вашего доступа): всего {total_items}, "
        f"со статусом «на складе» {on_warehouse}, с указанной ячейкой хранения {with_cell}."
    )

    occ_stmt = select(func.count()).select_from(WarehouseSlotOccupancy)
    if not see_all:
        occ_stmt = occ_stmt.where(WarehouseSlotOccupancy.owner_id == user.id)
    occ = session.exec(occ_stmt).one()
    lines.append(f"Занятых ячеек в проекции (slot_key → item): {occ}.")

    if see_all:
        lines.append("Доступ: вы видите товары всех пользователей (роль с правом items.read_all).")
    else:
        lines.append("Доступ: вы видите только свои товары.")

    return "\n".join(lines)
