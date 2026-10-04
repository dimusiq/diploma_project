"""
Приёмка как операция: фиксация факта по строкам, расхождения, закрытие.

Putaway создаётся только по принятому количеству (см. inbound_planning).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, col, select

from app.core.storage_slot import format_storage_slot_key, parse_storage_slot_key
from app.events import catalog
from app.models import (
    NOTIFICATION_SEVERITY_WARNING,
    InboundOrder,
    Item,
    User,
)
from app.services.domain_events import emit_domain_event
from app.services.inbound_planning import (
    RECEIVING_STATUS,
    _line_key,
    _line_qty,
    _line_sku,
    _suggest_slot,
    plan_inbound_putaways,
)
from app.services.lot_fefo import (
    ensure_lot_for_item,
    parse_line_expires_at,
    parse_line_lot_code,
)
from app.services.notification_service import create_notification
from app.services.outbound_fulfillment import parse_line_items

RECEIVING_OPEN_STATUSES = frozenset({"open", "awaiting", RECEIVING_STATUS})
RECEIVING_DONE_STATUS = "received"
TERMINAL_STATUSES = frozenset({"closed", "cancelled", "canceled", RECEIVING_DONE_STATUS})

DISCREPANCY_SHORTAGE = "shortage"
DISCREPANCY_OVERAGE = "overage"
DISCREPANCY_DAMAGE = "damage"
DISCREPANCY_TYPES = frozenset(
    {DISCREPANCY_SHORTAGE, DISCREPANCY_OVERAGE, DISCREPANCY_DAMAGE}
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _lines_container(order: InboundOrder) -> dict[str, Any]:
    raw = order.lines if isinstance(order.lines, dict) else {}
    return dict(raw)


def _items_list(container: dict[str, Any]) -> list[dict[str, Any]]:
    items = container.get("items")
    if isinstance(items, list):
        return [dict(x) if isinstance(x, dict) else {} for x in items]
    return []


def _find_line(
    lines: list[dict[str, Any]],
    *,
    line_index: int | None,
    line_key: str | None,
) -> tuple[int, dict[str, Any]]:
    if line_index is not None:
        if line_index < 0 or line_index >= len(lines):
            raise HTTPException(
                status_code=404, detail="Строка входящего заказа не найдена"
            )
        return line_index, lines[line_index]
    if line_key:
        for idx, line in enumerate(lines):
            if _line_key(line, idx) == line_key:
                return idx, line
        raise HTTPException(
            status_code=404, detail="Строка входящего заказа не найдена"
        )
    raise HTTPException(
        status_code=422,
        detail="Укажите line_index или line_key",
    )


def _resolve_coords(
    session: Session, slot: dict[str, Any]
) -> tuple[int, int, int, int]:
    row = slot.get("storage_row")
    level = slot.get("storage_level")
    cell_x = slot.get("storage_cell_x")
    cell_z = slot.get("storage_cell_z")
    if row is not None and level is not None and cell_x is not None:
        return int(row), int(level), int(cell_x), int(cell_z or 1)

    key = slot.get("slot_key")
    if key:
        parsed = parse_storage_slot_key(str(key))
        if parsed is not None:
            return parsed

    occupied: set[tuple[int, int, int, int]] = set()
    for item in session.exec(
        select(Item).where(
            col(Item.storage_row).is_not(None),
            col(Item.storage_level).is_not(None),
            col(Item.storage_cell_x).is_not(None),
        )
    ).all():
        occupied.add(
            (
                int(item.storage_row or 0),
                int(item.storage_level or 0),
                int(item.storage_cell_x or 0),
                int(item.storage_cell_z or 1),
            )
        )
    for r in range(1, 17):
        for lv in range(1, 5):
            for x in range(1, 21):
                cand = (r, lv, x, 1)
                if cand not in occupied:
                    return cand
    raise HTTPException(
        status_code=409,
        detail="Нет свободной ячейки для размещения принятого товара",
    )


def _build_discrepancy(
    *,
    ordered: int,
    received: int,
    damage_quantity: int,
    discrepancy_type: str | None,
    discrepancy_reason: str | None,
) -> dict[str, Any] | None:
    dtype = (discrepancy_type or "").strip().lower() or None
    if dtype and dtype not in DISCREPANCY_TYPES:
        raise HTTPException(
            status_code=422,
            detail="Тип расхождения: shortage, overage или damage",
        )
    if damage_quantity > 0:
        return {
            "type": DISCREPANCY_DAMAGE,
            "quantity": damage_quantity,
            "reason": (discrepancy_reason or "Брак при приёмке").strip(),
            "ordered_quantity": ordered,
            "received_quantity": received,
        }
    if received < ordered:
        return {
            "type": dtype or DISCREPANCY_SHORTAGE,
            "quantity": ordered - received,
            "reason": (discrepancy_reason or "Недостача при приёмке").strip(),
            "ordered_quantity": ordered,
            "received_quantity": received,
        }
    if received > ordered:
        return {
            "type": dtype or DISCREPANCY_OVERAGE,
            "quantity": received - ordered,
            "reason": (discrepancy_reason or "Излишек при приёмке").strip(),
            "ordered_quantity": ordered,
            "received_quantity": received,
        }
    if dtype:
        return {
            "type": dtype,
            "quantity": 0,
            "reason": (discrepancy_reason or "").strip() or "Расхождение",
            "ordered_quantity": ordered,
            "received_quantity": received,
        }
    return None


def _notify_discrepancy(
    session: Session,
    *,
    order: InboundOrder,
    line: dict[str, Any],
    discrepancy: dict[str, Any],
    actor_user_id: uuid.UUID | None,
) -> None:
    sku = _line_sku(line) or "—"
    title = f"Расхождение приёмки {order.code}"
    body = (
        f"SKU {sku}: {discrepancy.get('type')} "
        f"×{discrepancy.get('quantity')}. "
        f"{discrepancy.get('reason') or ''}"
    ).strip()
    recipients: set[uuid.UUID] = set()
    if actor_user_id is not None:
        recipients.add(actor_user_id)
    for u in session.exec(
        select(User).where(
            col(User.is_active).is_(True),
            col(User.deleted_at).is_(None),
            col(User.is_superuser).is_(True),
        )
    ).all():
        recipients.add(u.id)
    for uid in recipients:
        create_notification(
            session,
            uid,
            type="inbound.discrepancy",
            severity=NOTIFICATION_SEVERITY_WARNING,
            title=title,
            body=body,
            source="inbound_receiving",
            entity_type="inbound_order",
            entity_id=order.id,
        )


def _create_warehouse_item(
    session: Session,
    *,
    order: InboundOrder,
    line: dict[str, Any],
    received: int,
    owner_id: uuid.UUID,
    slot: dict[str, Any],
) -> Item:
    coords = _resolve_coords(session, slot)
    row, level, cell_x, cell_z = coords
    sku = _line_sku(line)
    title = str(line.get("title") or line.get("name") or sku or order.code)
    item = Item(
        title=title[:255],
        description=f"Приёмка {order.code}"[:255],
        quantity=received,
        sku=sku,
        unit=str(line.get("unit") or "шт")[:32] if line.get("unit") else "шт",
        owner_id=owner_id,
        status="warehouse",
        storage_row=row,
        storage_level=level,
        storage_cell_x=cell_x,
        storage_cell_z=cell_z,
    )
    session.add(item)
    session.flush()
    # дополнить slot координатами для putaway payload
    slot.setdefault("storage_row", row)
    slot.setdefault("storage_level", level)
    slot.setdefault("storage_cell_x", cell_x)
    slot.setdefault("storage_cell_z", cell_z)
    slot.setdefault(
        "slot_key",
        format_storage_slot_key(row, level, cell_x, cell_z),
    )
    return item


def receive_line(
    session: Session,
    order: InboundOrder,
    *,
    received_quantity: int,
    actor_user_id: uuid.UUID,
    line_index: int | None = None,
    line_key: str | None = None,
    discrepancy_type: str | None = None,
    discrepancy_reason: str | None = None,
    damage_quantity: int = 0,
) -> dict[str, Any]:
    """
    Фиксирует факт приёмки по строке: lines JSONB, товар warehouse+ячейка, putaway.
    Не коммитит.
    """
    if order.status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="Приёмка уже закрыта или заказ отменён",
        )
    if order.status not in RECEIVING_OPEN_STATUSES | {RECEIVING_STATUS}:
        raise HTTPException(
            status_code=409,
            detail=f"Нельзя принимать в статусе «{order.status}»",
        )
    if received_quantity < 0:
        raise HTTPException(
            status_code=422, detail="received_quantity не может быть отрицательным"
        )
    if damage_quantity < 0:
        raise HTTPException(
            status_code=422, detail="damage_quantity не может быть отрицательным"
        )

    container = _lines_container(order)
    lines = _items_list(container)
    if not lines:
        raise HTTPException(status_code=409, detail="У заказа нет строк для приёмки")

    idx, line = _find_line(lines, line_index=line_index, line_key=line_key)
    ordered = _line_qty(line)
    if ordered <= 0 and received_quantity <= 0 and damage_quantity <= 0:
        raise HTTPException(
            status_code=422, detail="Строка без заказанного количества"
        )

    prev_processed = bool(line.get("receiving_processed"))
    prev_qty = line.get("received_quantity")
    if prev_processed:
        try:
            same = prev_qty is not None and int(prev_qty) == int(received_quantity)
        except (TypeError, ValueError):
            same = False
        if same and int(line.get("damage_quantity") or 0) == int(damage_quantity):
            return {
                "order_id": str(order.id),
                "line_index": idx,
                "line_key": _line_key(line, idx),
                "idempotent": True,
                "item_id": line.get("received_item_id"),
                "putaway_created": 0,
            }
        raise HTTPException(
            status_code=409,
            detail="Строка уже обработана; повтор с другим количеством запрещён",
        )

    discrepancy = _build_discrepancy(
        ordered=ordered,
        received=received_quantity,
        damage_quantity=damage_quantity,
        discrepancy_type=discrepancy_type,
        discrepancy_reason=discrepancy_reason,
    )

    now = _now()
    if order.status != RECEIVING_STATUS:
        order.status = RECEIVING_STATUS

    sku = _line_sku(line)
    weight_kg = None
    try:
        if line.get("weight_kg") is not None:
            weight_kg = float(line["weight_kg"])
    except (TypeError, ValueError):
        weight_kg = None
    slot = (
        _suggest_slot(
            session,
            warehouse_id=order.warehouse_id,
            sku=sku,
            quantity=received_quantity,
            weight_kg=weight_kg,
            order_extra=order.extra if isinstance(order.extra, dict) else None,
        )
        or {}
    )
    item: Item | None = None
    if received_quantity > 0:
        top_up_id = slot.get("top_up_item_id")
        if top_up_id and slot.get("suggest_reason") == "top_up_same_sku":
            try:
                existing = session.get(Item, uuid.UUID(str(top_up_id)))
            except ValueError:
                existing = None
            if existing is not None and existing.status == "warehouse":
                existing.quantity = int(existing.quantity or 0) + received_quantity
                session.add(existing)
                session.flush()
                item = existing
            else:
                item = _create_warehouse_item(
                    session,
                    order=order,
                    line=line,
                    received=received_quantity,
                    owner_id=actor_user_id,
                    slot=slot,
                )
        else:
            # Новая позиция не делит ячейку (uq_item_storage_cell_when_full).
            item = _create_warehouse_item(
                session,
                order=order,
                line=line,
                received=received_quantity,
                owner_id=actor_user_id,
                slot=slot,
            )

    line["received_quantity"] = received_quantity
    line["damage_quantity"] = damage_quantity
    line["receiving_processed"] = True
    line["received_at"] = now.isoformat()
    if discrepancy is not None:
        line["discrepancy"] = discrepancy
    else:
        line.pop("discrepancy", None)
    if item is not None:
        line["received_item_id"] = str(item.id)
        line["storage_row"] = item.storage_row
        line["storage_level"] = item.storage_level
        line["storage_cell_x"] = item.storage_cell_x
        line["storage_cell_z"] = item.storage_cell_z
        line["slot_key"] = format_storage_slot_key(
            item.storage_row,
            item.storage_level,
            item.storage_cell_x,
            item.storage_cell_z,
        )
        lot = ensure_lot_for_item(
            session,
            warehouse_id=order.warehouse_id,
            item=item,
            quantity=received_quantity,
            lot_code=parse_line_lot_code(line),
            expires_at=parse_line_expires_at(line),
            received_at=now,
            slot_key=line.get("slot_key"),
        )
        line["lot_id"] = str(lot.id)
        line["lot_code"] = lot.lot_code
        if lot.expires_at is not None:
            line["expires_at"] = lot.expires_at.isoformat()

    lines[idx] = line
    container["items"] = lines
    order.lines = container
    order.updated_at = now
    session.add(order)
    session.flush()

    putaway_stats = {"created": 0, "task_ids": []}
    if received_quantity > 0:
        putaway_stats = plan_inbound_putaways(session, order)

    emit_domain_event(
        session,
        event_type=catalog.EVENT_INBOUND_RECEIVED,
        aggregate_type="inbound_order",
        aggregate_id=order.id,
        payload={
            "order_id": str(order.id),
            "order_code": order.code,
            "line_key": _line_key(line, idx),
            "line_index": idx,
            "sku": sku,
            "ordered_quantity": ordered,
            "received_quantity": received_quantity,
            "item_id": str(item.id) if item else None,
            "slot_key": line.get("slot_key"),
        },
        actor_user_id=actor_user_id,
        strict_payload=False,
    )

    if discrepancy is not None:
        emit_domain_event(
            session,
            event_type=catalog.EVENT_INBOUND_DISCREPANCY,
            aggregate_type="inbound_order",
            aggregate_id=order.id,
            payload={
                "order_id": str(order.id),
                "order_code": order.code,
                "line_key": _line_key(line, idx),
                "line_index": idx,
                "sku": sku,
                "discrepancy": discrepancy,
            },
            actor_user_id=actor_user_id,
            strict_payload=False,
        )
        _notify_discrepancy(
            session,
            order=order,
            line=line,
            discrepancy=discrepancy,
            actor_user_id=actor_user_id,
        )

    return {
        "order_id": str(order.id),
        "line_index": idx,
        "line_key": _line_key(line, idx),
        "idempotent": False,
        "item_id": str(item.id) if item else None,
        "discrepancy": discrepancy,
        "putaway_created": putaway_stats.get("created", 0),
        "putaway_task_ids": putaway_stats.get("task_ids", []),
    }


def close_receiving(
    session: Session,
    order: InboundOrder,
    *,
    actor_user_id: uuid.UUID | None,
) -> InboundOrder:
    """Закрывает операцию приёмки → status=received. Не коммитит."""
    if order.status in {"closed", "cancelled", "canceled"}:
        raise HTTPException(
            status_code=409, detail="Заказ уже закрыт или отменён"
        )
    if order.status == RECEIVING_DONE_STATUS:
        return order

    lines = parse_line_items(order.lines)
    unprocessed: list[str] = []
    for idx, line in enumerate(lines):
        if _line_qty(line) <= 0 and not line.get("receiving_processed"):
            continue
        if not line.get("receiving_processed"):
            unprocessed.append(_line_key(line, idx))
    if unprocessed:
        raise HTTPException(
            status_code=409,
            detail=(
                "Нельзя закрыть приёмку: есть необработанные строки "
                f"({', '.join(unprocessed[:5])}"
                f"{'…' if len(unprocessed) > 5 else ''})"
            ),
        )

    now = _now()
    order.status = RECEIVING_DONE_STATUS
    order.updated_at = now
    extra = dict(order.extra) if isinstance(order.extra, dict) else {}
    fulfillment = dict(extra.get("fulfillment") or {})
    fulfillment["receiving_closed_at"] = now.isoformat()
    fulfillment["receiving_closed_by"] = (
        str(actor_user_id) if actor_user_id else None
    )
    extra["fulfillment"] = fulfillment
    order.extra = extra
    session.add(order)

    discrepancies = [
        {
            "line_key": _line_key(line, idx),
            "discrepancy": line.get("discrepancy"),
        }
        for idx, line in enumerate(lines)
        if isinstance(line.get("discrepancy"), dict)
    ]
    emit_domain_event(
        session,
        event_type=catalog.EVENT_INBOUND_RECEIVED,
        aggregate_type="inbound_order",
        aggregate_id=order.id,
        payload={
            "order_id": str(order.id),
            "order_code": order.code,
            "phase": "receiving_closed",
            "status": RECEIVING_DONE_STATUS,
            "discrepancy_count": len(discrepancies),
            "discrepancies": discrepancies,
        },
        actor_user_id=actor_user_id,
        strict_payload=False,
    )
    return order
