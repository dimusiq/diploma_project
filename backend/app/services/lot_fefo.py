"""
Партии / сроки годности / FEFO.

Срок берётся из InventoryLot.expires_at (приоритет), иначе Item.expires_at.
FEFO: раньше истекает — раньше отбирается. Просроченное не планируется и не отгружается.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

from sqlmodel import Session, col, select

from app.core.storage_slot import format_storage_slot_key
from app.models import InventoryLot, Item


def today_utc() -> date:
    return datetime.now(timezone.utc).date()


def is_expired(expires: date | None, *, on: date | None = None) -> bool:
    if expires is None:
        return False
    return expires < (on or today_utc())


def fefo_sort_key(
    expires: date | None,
    *,
    storage_level: int | None,
    storage_row: int | None,
    storage_cell_x: int | None,
) -> tuple[Any, ...]:
    """
    Меньше = раньше в очереди отбора.
    Партии без срока — после датированных; затем pick-face / адрес.
    """
    # date.max как «без срока» — после всех реальных сроков
    exp_key = expires if expires is not None else date.max
    pick_face = 0 if (storage_level or 99) == 1 else 1
    return (
        exp_key,
        pick_face,
        storage_level or 99,
        storage_row or 99,
        storage_cell_x or 99,
    )


def pick_lots_for_fefo_test(
    lots: list[tuple[str, date | None, int]],
    *,
    need: int,
    on: date | None = None,
) -> list[str]:
    """
    Чистая FEFO-выборка для тестов: [(lot_code, expires, qty), ...] → коды в порядке отбора.
    Просроченные пропускаются.
    """
    day = on or today_utc()
    ranked = [
        (code, exp, qty)
        for code, exp, qty in lots
        if qty > 0 and not is_expired(exp, on=day)
    ]
    ranked.sort(
        key=lambda r: fefo_sort_key(
            r[1], storage_level=1, storage_row=1, storage_cell_x=1
        )
    )
    out: list[str] = []
    left = need
    for code, _exp, qty in ranked:
        if left <= 0:
            break
        out.append(code)
        left -= min(qty, left)
    return out


def load_active_lots_by_item_ids(
    session: Session, item_ids: list[UUID]
) -> dict[UUID, InventoryLot]:
    """Одна активная партия на item (с ближайшим сроком, если несколько)."""
    if not item_ids:
        return {}
    rows = session.exec(
        select(InventoryLot).where(
            col(InventoryLot.item_id).in_(item_ids),
            InventoryLot.status == "active",
        )
    ).all()
    best: dict[UUID, InventoryLot] = {}
    for lot in rows:
        if lot.item_id is None:
            continue
        prev = best.get(lot.item_id)
        if prev is None:
            best[lot.item_id] = lot
            continue
        # предпочесть более ранний срок
        pe = prev.expires_at
        le = lot.expires_at
        if pe is None and le is not None:
            best[lot.item_id] = lot
        elif pe is not None and le is not None and le < pe:
            best[lot.item_id] = lot
    return best


def effective_expires_at(item: Item, lot: InventoryLot | None = None) -> date | None:
    if lot is not None and lot.expires_at is not None:
        return lot.expires_at
    return item.expires_at


def annotate_lot_fields(item: Item, lot: InventoryLot | None) -> dict[str, Any]:
    exp = effective_expires_at(item, lot)
    data: dict[str, Any] = {
        "expires_at": exp.isoformat() if exp else None,
    }
    if lot is not None:
        data["lot_id"] = str(lot.id)
        data["lot_code"] = lot.lot_code
    return data


def ensure_lot_for_item(
    session: Session,
    *,
    warehouse_id: UUID,
    item: Item,
    quantity: int,
    lot_code: str | None = None,
    expires_at: date | None = None,
    received_at: datetime | None = None,
    slot_key: str | None = None,
) -> InventoryLot:
    """
    Создаёт или обновляет активную партию, связанную с item и (опционально) ячейкой.
    Синхронизирует Item.expires_at.
    """
    existing = session.exec(
        select(InventoryLot).where(
            InventoryLot.item_id == item.id,
            InventoryLot.status == "active",
        )
    ).first()
    now = received_at or datetime.now(timezone.utc)
    code = (lot_code or f"LOT-{str(item.id)[:8]}").strip()[:128]
    key = slot_key or format_storage_slot_key(
        item.storage_row,
        item.storage_level,
        item.storage_cell_x,
        item.storage_cell_z,
    )

    if existing is not None:
        existing.quantity = max(int(existing.quantity or 0), int(quantity))
        if expires_at is not None:
            existing.expires_at = expires_at
        if key:
            extra = dict(existing.extra) if isinstance(existing.extra, dict) else {}
            extra["slot_key"] = key
            if item.storage_row is not None:
                extra["storage_row"] = item.storage_row
                extra["storage_level"] = item.storage_level
                extra["storage_cell_x"] = item.storage_cell_x
                extra["storage_cell_z"] = item.storage_cell_z
            existing.extra = extra
        session.add(existing)
        lot = existing
    else:
        new_extra: dict[str, Any] = {"source": "lot_fefo"}
        if key:
            new_extra["slot_key"] = key
            if item.storage_row is not None:
                new_extra["storage_row"] = item.storage_row
                new_extra["storage_level"] = item.storage_level
                new_extra["storage_cell_x"] = item.storage_cell_x
                new_extra["storage_cell_z"] = item.storage_cell_z
        lot = InventoryLot(
            warehouse_id=warehouse_id,
            lot_code=code,
            item_id=item.id,
            quantity=int(quantity),
            received_at=now,
            expires_at=expires_at,
            status="active",
            extra=new_extra,
        )
        session.add(lot)

    if expires_at is not None:
        item.expires_at = expires_at
        session.add(item)
    session.flush()
    return lot


def parse_line_expires_at(line: dict[str, Any]) -> date | None:
    for key in ("expires_at", "expiry", "expiry_date", "best_before"):
        raw = line.get(key)
        if raw is None or raw == "":
            continue
        if isinstance(raw, date) and not isinstance(raw, datetime):
            return raw
        if isinstance(raw, datetime):
            return raw.date()
        if isinstance(raw, str):
            try:
                return date.fromisoformat(raw[:10])
            except ValueError:
                continue
    return None


def parse_line_lot_code(line: dict[str, Any]) -> str | None:
    for key in ("lot_code", "lot", "batch", "batch_code"):
        raw = line.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()[:128]
    return None


def expired_shipment_blockers(
    session: Session, items: list[Item], *, on: date | None = None
) -> list[str]:
    """Сообщения-блокеры для просроченных позиций к отгрузке."""
    day = on or today_utc()
    lots = load_active_lots_by_item_ids(session, [i.id for i in items])
    blockers: list[str] = []
    for item in items:
        exp = effective_expires_at(item, lots.get(item.id))
        if is_expired(exp, on=day):
            sku = item.sku or str(item.id)[:8]
            blockers.append(
                f"просрочен товар {sku} (срок {exp.isoformat() if exp else '—'})"
            )
    return blockers
