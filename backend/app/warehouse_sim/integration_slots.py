"""Маппинг слотов симулятора ↔ WMS storage coordinates."""

from __future__ import annotations

import uuid

from sqlmodel import Session, select

from app.events import catalog
from app.models import Item
from app.services.domain_events import emit_domain_event
from app.services.warehouse_slot_projection import sync_projection_for_item
from app.warehouse_sim.integration_context import _DomainCtx, _history
from app.warehouse_sim.integration_schemas import (
    _SIM_STORAGE_BAYS,
    _SIM_STORAGE_LEVELS,
    _SIM_STORAGE_ROWS,
    _STATUS_CHAIN,
    SOURCE,
)
from app.warehouse_sim.layout import BLOCK_COUNT


def _move_item_status(
    ctx: _DomainCtx,
    item: Item,
    new_status: str,
    coords: tuple[int, int, int, int] | None,
) -> None:
    if new_status == "warehouse" and coords is None:
        coords = _free_slot(ctx, None, exclude=item.id)
    if coords is not None:
        coords = _free_slot(ctx, coords, exclude=item.id) or coords
        old = (
            item.storage_row,
            item.storage_level,
            item.storage_cell_x,
            item.storage_cell_z,
        )
        if (
            old[0] is not None
            and old[1] is not None
            and old[2] is not None
            and old[3] is not None
        ):
            ctx.mark_slot_freed((int(old[0]), int(old[1]), int(old[2]), int(old[3])))
        item.storage_row, item.storage_level, item.storage_cell_x, item.storage_cell_z = (
            coords
        )
        item.location = f"{coords[0]}-{coords[1]}-{coords[2]}-{coords[3]}"
        ctx.mark_slot_taken(coords)
        if old != coords:
            _history(ctx, item, "storage_row", str(old[0] or ""), str(coords[0]))
    elif new_status in ("shipment", "shipped"):
        if item.storage_row is not None:
            _history(ctx, item, "storage_row", str(item.storage_row or ""), "")
            if (
                item.storage_level is not None
                and item.storage_cell_x is not None
                and item.storage_cell_z is not None
            ):
                ctx.mark_slot_freed(
                    (
                        int(item.storage_row),
                        int(item.storage_level),
                        int(item.storage_cell_x),
                        int(item.storage_cell_z),
                    )
                )
        item.storage_row = None
        item.storage_level = None
        item.storage_cell_x = None
        item.storage_cell_z = None

    try:
        cur = _STATUS_CHAIN.index(item.status)
        tgt = _STATUS_CHAIN.index(new_status)
    except ValueError:
        cur, tgt = 0, 0
    while cur < tgt:
        cur += 1
        target = _STATUS_CHAIN[cur]
        old_status = item.status
        item.status = target
        _history(ctx, item, "status", old_status, target)
        emit_domain_event(
            ctx.session,
            event_type=catalog.EVENT_ITEM_STATUS_CHANGED,
            aggregate_type="item",
            aggregate_id=item.id,
            actor_user_id=ctx.actor_id,
            payload={"from": old_status, "to": target, "source": SOURCE},
        )
    ctx.session.add(item)
    sync_projection_for_item(ctx.session, item)
    ctx.session.flush()


def _clear_item_slot(ctx: _DomainCtx, item: Item, *, location: str) -> None:
    if item.storage_row is not None:
        _history(ctx, item, "storage_row", str(item.storage_row), "")
        if (
            item.storage_level is not None
            and item.storage_cell_x is not None
            and item.storage_cell_z is not None
        ):
            ctx.mark_slot_freed(
                (
                    int(item.storage_row),
                    int(item.storage_level),
                    int(item.storage_cell_x),
                    int(item.storage_cell_z),
                )
            )
    item.storage_row = None
    item.storage_level = None
    item.storage_cell_x = None
    item.storage_cell_z = None
    item.location = location
    ctx.session.add(item)
    sync_projection_for_item(ctx.session, item)
    ctx.session.flush()


def _slot_from_context(c: dict) -> tuple[int, int, int, int] | None:
    """
    Полный ключ физической ячейки → WMS (row, level, bay, z=1).

    rack-N-A → row = 2*N-1, rack-N-B → row = 2*N (N=1..8 → row 1..16).
    Стороны A/B больше не схлопываются; 16×3×12 = 576 различимых слотов.
    """
    cell = c.get("cell")
    if not cell:
        return None
    rack_id = str(cell.get("rackId") or "rack-1-A")
    parts = rack_id.split("-")
    rack_n = 1
    side = "A"
    if len(parts) >= 3:
        try:
            rack_n = int(parts[1])
        except ValueError:
            rack_n = 1
        side_raw = parts[-1].upper()
        if side_raw in ("A", "B", "L", "R"):
            side = "A" if side_raw in ("A", "L") else "B"
    else:
        try:
            rack_n = int(parts[-1])
        except ValueError:
            rack_n = 1
    rack_n = max(1, min(BLOCK_COUNT, rack_n))
    side_offset = 0 if side == "A" else 1
    row = 2 * (rack_n - 1) + 1 + side_offset
    level = max(1, min(_SIM_STORAGE_LEVELS, int(cell.get("level") or 1)))
    bay = max(1, min(_SIM_STORAGE_BAYS, int(cell.get("bay") or 1)))
    return row, level, bay, 1


def _slot_occupied_db(
    session: Session,
    coords: tuple[int, int, int, int],
    *,
    exclude: uuid.UUID | None,
) -> bool:
    """Индексированная проверка занятости одного слота (LIMIT 1)."""
    stmt = (
        select(Item.id)
        .where(
            Item.storage_row == coords[0],
            Item.storage_level == coords[1],
            Item.storage_cell_x == coords[2],
            Item.storage_cell_z == coords[3],
        )
        .limit(1)
    )
    if exclude is not None:
        stmt = stmt.where(Item.id != exclude)
    return session.exec(stmt).first() is not None


def _free_slot(
    ctx: _DomainCtx,
    preferred: tuple[int, int, int, int] | None,
    *,
    exclude: uuid.UUID | None,
) -> tuple[int, int, int, int] | None:
    """
    Свободный слот: preferred проверяется LIMIT 1; иначе — кэш occupied на батч
    (один SELECT координат вместо полного скана на каждый вызов).
    """
    if preferred:
        row, level, x, _z = preferred
        preferred_norm = (int(row), int(level), int(x), 1)
        occupied = ctx._occupied_slots
        if occupied is not None:
            if preferred_norm not in occupied:
                ctx.mark_slot_taken(preferred_norm)
                return preferred_norm
        ctx._slot_queries += 1
        if not _slot_occupied_db(ctx.session, preferred_norm, exclude=exclude):
            ctx.mark_slot_taken(preferred_norm)
            return preferred_norm

    occupied = set(ctx.occupied_slots())
    if exclude is not None:
        item = ctx.session.get(Item, exclude)
        if (
            item is not None
            and item.storage_row is not None
            and item.storage_level is not None
            and item.storage_cell_x is not None
            and item.storage_cell_z is not None
        ):
            occupied.discard(
                (
                    int(item.storage_row),
                    int(item.storage_level),
                    int(item.storage_cell_x),
                    int(item.storage_cell_z),
                )
            )
    for row in range(1, _SIM_STORAGE_ROWS + 1):
        for level in range(1, _SIM_STORAGE_LEVELS + 1):
            for x in range(1, _SIM_STORAGE_BAYS + 1):
                cand = (row, level, x, 1)
                if cand not in occupied:
                    ctx.mark_slot_taken(cand)
                    return cand
    return preferred


def _location_from_context(c: dict) -> str | None:
    cell = c.get("cell")
    if cell:
        return str(cell.get("id"))
    pallet = c.get("pallet") or {}
    return pallet.get("locationId")
