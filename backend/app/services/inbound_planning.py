"""
Планирование размещения: входящий заказ в статусе receiving → putaway-задачи.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session, select

from app.models import InboundOrder, WarehouseTask
from app.services.outbound_fulfillment import DONE_TASK_STATUSES, parse_line_items
from app.services.putaway_strategy import (
    config_from_order_extra,
    suggest_putaway_slot,
)

RECEIVING_STATUS = "receiving"
RECEIVING_DONE_STATUS = "received"
RECEIVING_CLOSED_STATUS = "closed"
# Putaway планируется после факта приёмки строки (receiving_processed).
PUTAWAY_PLAN_STATUSES = frozenset({RECEIVING_STATUS, RECEIVING_DONE_STATUS})


def _line_key(line: dict[str, Any], index: int) -> str:
    raw = line.get("line_id") or line.get("lineId") or line.get("id")
    if raw:
        return str(raw)
    sku = line.get("skuId") or line.get("sku_id") or line.get("sku") or ""
    return f"{index}:{sku}"


def _line_qty(line: dict[str, Any]) -> int:
    for key in ("quantity", "qty", "pallets"):
        try:
            n = int(line.get(key) or 0)
        except (TypeError, ValueError):
            n = 0
        if n > 0:
            return n
    return 0


def _line_received_qty(line: dict[str, Any]) -> int:
    """Количество к размещению: только после обработки строки приёмки."""
    if not line.get("receiving_processed"):
        return 0
    try:
        return max(0, int(line.get("received_quantity") or 0))
    except (TypeError, ValueError):
        return 0


def _line_sku(line: dict[str, Any]) -> str | None:
    for key in ("skuId", "sku_id", "sku"):
        raw = line.get(key)
        if raw:
            return str(raw).strip()
    return None


def _related_inbound_tasks(
    session: Session, order: InboundOrder
) -> list[WarehouseTask]:
    oid = str(order.id)
    rows = session.exec(
        select(WarehouseTask).where(WarehouseTask.warehouse_id == order.warehouse_id)
    ).all()
    matched: list[WarehouseTask] = []
    for task in rows:
        payload = task.payload if isinstance(task.payload, dict) else {}
        if str(payload.get("order_id") or "") == oid:
            matched.append(task)
    return matched


def _planned_putaway_bases(tasks: list[WarehouseTask], order_id: uuid.UUID) -> set[str]:
    keys: set[str] = set()
    oid = str(order_id)
    for task in tasks:
        if task.task_type != "putaway":
            continue
        payload = task.payload if isinstance(task.payload, dict) else {}
        if str(payload.get("order_id") or "") != oid:
            continue
        lk = str(payload.get("line_key") or "")
        if lk:
            keys.add(lk.split("#", 1)[0])
    return keys


def _suggest_slot(
    session: Session,
    *,
    warehouse_id: uuid.UUID,
    sku: str | None,
    quantity: int = 1,
    weight_kg: float | None = None,
    category_id: uuid.UUID | None = None,
    strategy: str | None = None,
    order_extra: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """P3-17: ABC + дозаполнение + вместимость (см. putaway_strategy)."""
    cfg = config_from_order_extra(order_extra)
    if strategy:
        from app.services.putaway_strategy import (
            PutawayStrategyConfig,
            parse_strategy_name,
        )

        cfg = PutawayStrategyConfig(
            name=parse_strategy_name(strategy),
            allow_sku_mix=cfg.allow_sku_mix,
            default_bin_capacity_qty=cfg.default_bin_capacity_qty,
            heavy_weight_kg=cfg.heavy_weight_kg,
            max_level_for_heavy=cfg.max_level_for_heavy,
            abc_period_days=cfg.abc_period_days,
        )
    return suggest_putaway_slot(
        session,
        warehouse_id=warehouse_id,
        sku=sku,
        quantity=quantity,
        category_id=category_id,
        weight_kg=weight_kg,
        config=cfg,
    )


def plan_inbound_putaways(session: Session, order: InboundOrder) -> dict[str, Any]:
    """Создаёт putaway по принятым строкам (received_quantity). Не коммитит."""
    if order.status not in PUTAWAY_PLAN_STATUSES:
        return {"created": 0, "skipped_existing": 0, "task_ids": []}

    lines = parse_line_items(order.lines)
    existing = _related_inbound_tasks(session, order)
    planned = _planned_putaway_bases(existing, order.id)
    now = datetime.now(timezone.utc)
    created: list[uuid.UUID] = []
    skipped = 0

    for idx, line in enumerate(lines):
        base_key = _line_key(line, idx)
        if base_key in planned:
            skipped += 1
            continue
        qty = _line_received_qty(line)
        if qty <= 0:
            continue
        sku = _line_sku(line)
        weight_kg = None
        try:
            if line.get("weight_kg") is not None:
                weight_kg = float(line["weight_kg"])
        except (TypeError, ValueError):
            weight_kg = None
        # Если ячейка уже выбрана при приёмке — не пересчитываем.
        if line.get("slot_key") or line.get("storage_row") is not None:
            slot = {
                k: line.get(k)
                for k in (
                    "slot_key",
                    "storage_row",
                    "storage_level",
                    "storage_cell_x",
                    "storage_cell_z",
                    "suggest_reason",
                    "abc_class",
                    "putaway_strategy",
                    "top_up_item_id",
                )
                if line.get(k) is not None
            }
        else:
            slot = (
                _suggest_slot(
                    session,
                    warehouse_id=order.warehouse_id,
                    sku=sku,
                    quantity=qty,
                    weight_kg=weight_kg,
                    order_extra=order.extra if isinstance(order.extra, dict) else None,
                )
                or {}
            )
        payload = {
            "order_id": str(order.id),
            "order_code": order.code,
            "line_key": base_key,
            "line_index": idx,
            "sku": sku,
            "quantity": qty,
            "item_id": line.get("received_item_id"),
            "unit": str(line.get("unit") or "шт"),
            "planned_via": "inbound_planning",
            **slot,
        }
        task = WarehouseTask(
            warehouse_id=order.warehouse_id,
            task_type="putaway",
            status="pending",
            priority=0,
            payload=payload,
            created_at=now,
            updated_at=now,
        )
        if slot.get("storage_bin_id"):
            try:
                task.storage_bin_id = uuid.UUID(str(slot["storage_bin_id"]))
            except ValueError:
                pass
        session.add(task)
        session.flush()
        created.append(task.id)
        planned.add(base_key)

    order.updated_at = now
    session.add(order)
    return {
        "created": len(created),
        "skipped_existing": skipped,
        "task_ids": [str(i) for i in created],
    }


def sync_inbound_status_from_tasks(session: Session, order: InboundOrder) -> str:
    """Все putaway done → closed (жизненный цикл входящего завершён). Не коммитит."""
    if order.status in {"closed", "cancelled", "canceled"}:
        return order.status
    tasks = [
        t for t in _related_inbound_tasks(session, order) if t.task_type == "putaway"
    ]
    if not tasks:
        return order.status
    if all(t.status in DONE_TASK_STATUSES for t in tasks):
        if order.status != RECEIVING_CLOSED_STATUS:
            order.status = RECEIVING_CLOSED_STATUS
            order.updated_at = datetime.now(timezone.utc)
            session.add(order)
        return RECEIVING_CLOSED_STATUS
    return order.status


def find_inbound_for_task(session: Session, task: WarehouseTask) -> InboundOrder | None:
    payload = task.payload if isinstance(task.payload, dict) else {}
    raw = payload.get("order_id")
    if not raw:
        return None
    try:
        oid = uuid.UUID(str(raw))
    except ValueError:
        return None
    return session.get(InboundOrder, oid)
