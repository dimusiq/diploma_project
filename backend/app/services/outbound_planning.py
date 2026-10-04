"""
Планирование отбора: исходящий заказ → задания WarehouseTask(task_type=pick).

Стратегия ячейки: pick-face (storage_level=1) → reserve → любая с адресом.
Идемпотентность по (order_id, line_key) среди уже созданных pick-задач.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session, col, select

from app.core.storage_slot import format_storage_slot_key
from app.models import Item, OutboundOrder, WarehouseTask
from app.services.item_reservation import item_available, reserve_for_task
from app.services.lot_fefo import (
    annotate_lot_fields,
    effective_expires_at,
    fefo_sort_key,
    is_expired,
    load_active_lots_by_item_ids,
    today_utc,
)
from app.services.outbound_fulfillment import (
    DONE_TASK_STATUSES,
    parse_line_items,
    related_tasks,
)

PLAN_STATUSES = frozenset({"open", "confirmed", "picking"})
PICKING_STATUS = "picking"
PICKING_COMPLETE_STATUS = "picking_complete"


def _line_key(line: dict[str, Any], index: int) -> str:
    raw = line.get("line_id") or line.get("lineId") or line.get("id")
    if raw:
        return str(raw)
    sku = line.get("skuId") or line.get("sku_id") or line.get("sku") or ""
    item_id = line.get("item_id") or line.get("itemId") or ""
    return f"{index}:{sku}:{item_id}"


def _line_qty(line: dict[str, Any]) -> int:
    for key in ("quantity", "qty", "pallets"):
        try:
            n = int(line.get(key) or 0)
        except (TypeError, ValueError):
            n = 0
        if n > 0:
            return n
    return 0


def _line_sku(line: dict[str, Any]) -> str | None:
    for key in ("skuId", "sku_id", "sku"):
        raw = line.get(key)
        if raw:
            return str(raw).strip()
    return None


def _line_item_id(line: dict[str, Any]) -> uuid.UUID | None:
    for key in ("item_id", "itemId"):
        raw = line.get(key)
        if not raw:
            continue
        try:
            return uuid.UUID(str(raw))
        except ValueError:
            continue
    return None


def _line_unit(line: dict[str, Any]) -> str:
    return str(line.get("unit") or "шт")


def _priority_for_order(order: OutboundOrder) -> int:
    if order.ship_by_at is None:
        return 0
    due = order.ship_by_at
    if due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    hours = max(0.0, (due - now).total_seconds() / 3600.0)
    return max(0, min(100, int(100 - hours * 2)))


def _slot_dict(item: Item) -> dict[str, Any]:
    key = format_storage_slot_key(
        item.storage_row,
        item.storage_level,
        item.storage_cell_x,
        item.storage_cell_z,
    )
    level = item.storage_level
    kind = None
    if level == 1:
        kind = "pick_face"
    elif level is not None and level > 1:
        kind = "reserve"
    return {
        "slot_key": key,
        "storage_row": item.storage_row,
        "storage_level": item.storage_level,
        "storage_cell_x": item.storage_cell_x,
        "storage_cell_z": item.storage_cell_z,
        "slot_kind": kind,
    }


def _candidate_items(
    session: Session, *, sku: str | None, item_id: uuid.UUID | None
) -> list[Item]:
    """Кандидаты на отбор: не просроченные, порядок FEFO → pick-face → адрес."""
    stmt = select(Item).where(
        Item.status == "warehouse",
        col(Item.storage_row).is_not(None),
        col(Item.storage_level).is_not(None),
        col(Item.storage_cell_x).is_not(None),
        col(Item.quantity) > 0,
    )
    if item_id is not None:
        stmt = stmt.where(Item.id == item_id)
    elif sku:
        stmt = stmt.where(Item.sku == sku)
    else:
        return []
    rows = [i for i in session.exec(stmt).all() if item_available(i) > 0]
    lots = load_active_lots_by_item_ids(session, [i.id for i in rows])
    day = today_utc()
    usable: list[Item] = []
    for item in rows:
        exp = effective_expires_at(item, lots.get(item.id))
        if is_expired(exp, on=day):
            continue
        usable.append(item)
    usable.sort(
        key=lambda i: fefo_sort_key(
            effective_expires_at(i, lots.get(i.id)),
            storage_level=i.storage_level,
            storage_row=i.storage_row,
            storage_cell_x=i.storage_cell_x,
        )
    )
    return usable


def _planned_line_keys(tasks: list[WarehouseTask], order_id: uuid.UUID) -> set[str]:
    """Базовые line_key (без #part), уже имеющие задачи."""
    keys: set[str] = set()
    oid = str(order_id)
    for task in tasks:
        if task.task_type != "pick":
            continue
        payload = task.payload if isinstance(task.payload, dict) else {}
        if str(payload.get("order_id") or "") != oid:
            continue
        lk = str(payload.get("line_key") or "")
        if not lk:
            continue
        base = lk.split("#", 1)[0]
        keys.add(base)
    return keys


def plan_outbound_picks(session: Session, order: OutboundOrder) -> dict[str, Any]:
    """
    Создаёт pick-задачи по строкам заказа. Не коммитит — вызывающий владеет транзакцией.
    """
    if order.status not in PLAN_STATUSES:
        return {
            "created": 0,
            "skipped_existing": 0,
            "shortage_lines": [],
            "task_ids": [],
        }

    lines = parse_line_items(order.lines)
    existing_tasks = related_tasks(session, order)
    planned_bases = _planned_line_keys(existing_tasks, order.id)

    priority = _priority_for_order(order)
    now = datetime.now(timezone.utc)
    created: list[uuid.UUID] = []
    skipped = 0
    shortage: list[dict[str, Any]] = []

    for idx, line in enumerate(lines):
        base_key = _line_key(line, idx)
        if base_key in planned_bases:
            skipped += 1
            continue
        need = _line_qty(line)
        if need <= 0:
            continue
        sku = _line_sku(line)
        item_id = _line_item_id(line)
        candidates = _candidate_items(session, sku=sku, item_id=item_id)
        cand_lots = load_active_lots_by_item_ids(
            session, [c.id for c in candidates]
        )
        remaining = need
        part = 0
        for item in candidates:
            if remaining <= 0:
                break
            session.refresh(item)
            take = min(item_available(item), remaining)
            if take <= 0:
                continue
            part += 1
            task_line_key = base_key if part == 1 else f"{base_key}#{part}"
            slot = _slot_dict(item)
            lot_meta = annotate_lot_fields(item, cand_lots.get(item.id))
            payload = {
                "order_id": str(order.id),
                "order_code": order.code,
                "line_key": task_line_key,
                "line_base_key": base_key,
                "line_index": idx,
                "item_id": str(item.id),
                "sku": item.sku or sku,
                "quantity": take,
                "unit": _line_unit(line),
                **slot,
                **lot_meta,
                "pick_policy": "FEFO",
                "planned_via": "outbound_planning",
            }
            task = WarehouseTask(
                warehouse_id=order.warehouse_id,
                task_type="pick",
                status="pending",
                priority=priority,
                payload=payload,
                created_at=now,
                updated_at=now,
            )
            session.add(task)
            session.flush()
            reserve_for_task(
                session,
                item_id=item.id,
                quantity=take,
                warehouse_task_id=task.id,
                outbound_order_id=order.id,
            )
            created.append(task.id)
            remaining -= take

        if part > 0:
            planned_bases.add(base_key)

        if remaining > 0:
            shortage.append(
                {
                    "line_key": base_key,
                    "line_index": idx,
                    "sku": sku,
                    "item_id": str(item_id) if item_id else None,
                    "requested": need,
                    "short_by": remaining,
                    "partial": part > 0,
                }
            )

    extra = dict(order.extra) if isinstance(order.extra, dict) else {}
    prev_ff = extra.get("fulfillment")
    fulfillment = dict(prev_ff) if isinstance(prev_ff, dict) else {}
    fulfillment["shortage"] = bool(shortage)
    fulfillment["shortage_lines"] = shortage
    fulfillment["picks_planned_at"] = now.isoformat()
    extra["fulfillment"] = fulfillment
    order.extra = extra

    if created and order.status in {"open", "confirmed"}:
        order.status = PICKING_STATUS
    order.updated_at = now
    session.add(order)

    return {
        "created": len(created),
        "skipped_existing": skipped,
        "shortage_lines": shortage,
        "task_ids": [str(i) for i in created],
    }


def sync_outbound_status_from_tasks(session: Session, order: OutboundOrder) -> str:
    """Все pick done → ``picking_complete``. Не трогает packed/shipped. Не коммитит."""
    if order.status in {"packed", "shipped", "closed", "cancelled"}:
        return order.status
    tasks = related_tasks(session, order)
    picks = [t for t in tasks if t.task_type == "pick"]
    if not picks:
        return order.status
    if all(t.status in DONE_TASK_STATUSES for t in picks):
        if order.status != PICKING_COMPLETE_STATUS:
            order.status = PICKING_COMPLETE_STATUS
            order.updated_at = datetime.now(timezone.utc)
            session.add(order)
        return PICKING_COMPLETE_STATUS
    return order.status


def find_order_for_task(session: Session, task: WarehouseTask) -> OutboundOrder | None:
    payload = task.payload if isinstance(task.payload, dict) else {}
    raw = payload.get("order_id")
    if not raw:
        return None
    try:
        oid = uuid.UUID(str(raw))
    except ValueError:
        return None
    return session.get(OutboundOrder, oid)


__all__ = [
    "PICKING_COMPLETE_STATUS",
    "PICKING_STATUS",
    "PLAN_STATUSES",
    "find_order_for_task",
    "plan_outbound_picks",
    "sync_outbound_status_from_tasks",
]
