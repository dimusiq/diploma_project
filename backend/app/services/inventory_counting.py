"""
Инвентаризация: задание count → факты → расхождения → проведение акта.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlmodel import col, Session, func, select

from app.core.storage_slot import format_storage_slot_key
from app.events import catalog
from app.models import (
    InventoryCountAct,
    InventoryCountLine,
    Item,
    ItemHistory,
    Warehouse,
    WarehouseSlotOccupancy,
    WarehouseTask,
)
from app.services.domain_events import emit_domain_event
from app.services.warehouse_slot_projection import sync_projection_for_item

STATUS_DRAFT = "draft"
STATUS_POSTED = "posted"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def resolve_warehouse_id(
    session: Session, warehouse_id: uuid.UUID | None
) -> uuid.UUID:
    if warehouse_id is not None:
        wh = session.get(Warehouse, warehouse_id)
        if not wh:
            raise HTTPException(status_code=404, detail="Склад не найден")
        return warehouse_id
    wh = session.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if not wh:
        wh = session.exec(select(Warehouse).order_by(col(Warehouse.created_at))).first()
    if not wh:
        raise HTTPException(status_code=500, detail="Не настроен ни один склад")
    return wh.id


def _item_slot_key(item: Item) -> str | None:
    return format_storage_slot_key(
        item.storage_row,
        item.storage_level,
        item.storage_cell_x,
        item.storage_cell_z,
    )


def _resolve_item(
    session: Session,
    *,
    item_id: uuid.UUID | None,
    slot_key: str | None,
    sku: str | None,
) -> Item:
    if item_id is not None:
        item = session.get(Item, item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Товар не найден")
        return item
    if slot_key:
        occ = session.get(WarehouseSlotOccupancy, slot_key)
        if occ is None:
            raise HTTPException(
                status_code=404, detail=f"В ячейке «{slot_key}» нет товара"
            )
        item = session.get(Item, occ.item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Товар ячейки не найден")
        return item
    if sku:
        item = session.exec(select(Item).where(Item.sku == sku).limit(1)).first()
        if item is None:
            raise HTTPException(
                status_code=404, detail=f"Товар со SKU «{sku}» не найден"
            )
        return item
    raise HTTPException(
        status_code=422, detail="Укажите item_id, slot_key или sku"
    )


def act_to_public(
    act: InventoryCountAct,
    lines: list[InventoryCountLine],
    *,
    idempotent: bool = False,
) -> dict[str, Any]:
    return {
        "id": act.id,
        "warehouse_id": act.warehouse_id,
        "warehouse_task_id": act.warehouse_task_id,
        "status": act.status,
        "mode": act.mode,
        "reason": act.reason,
        "actor_user_id": act.actor_user_id,
        "posted_at": act.posted_at,
        "created_at": act.created_at,
        "updated_at": act.updated_at,
        "idempotent": idempotent,
        "lines": [
            {
                "id": ln.id,
                "item_id": ln.item_id,
                "slot_key": ln.slot_key,
                "sku": ln.sku,
                "system_qty": ln.system_qty,
                "counted_qty": ln.counted_qty,
                "variance": ln.variance,
            }
            for ln in lines
        ],
    }


def load_lines(session: Session, act_id: uuid.UUID) -> list[InventoryCountLine]:
    return list(
        session.exec(
            select(InventoryCountLine)
            .where(InventoryCountLine.act_id == act_id)
            .order_by(col(InventoryCountLine.created_at))
        ).all()
    )


def create_count(
    session: Session,
    *,
    warehouse_id: uuid.UUID | None,
    mode: str,
    reason: str | None,
    line_inputs: list[dict[str, Any]],
    actor_user_id: uuid.UUID,
) -> InventoryCountAct:
    """Создаёт задание count + черновик акта со снимком system_qty. Не коммитит."""
    wid = resolve_warehouse_id(session, warehouse_id)
    mode_n = (mode or "selective").strip().lower()
    if mode_n not in {"selective", "cycle"}:
        raise HTTPException(
            status_code=422, detail="mode: selective или cycle"
        )
    if not line_inputs:
        raise HTTPException(status_code=422, detail="Нужна хотя бы одна строка")

    now = _now()
    seen: set[uuid.UUID] = set()
    resolved: list[Item] = []
    for raw in line_inputs:
        item = _resolve_item(
            session,
            item_id=raw.get("item_id"),
            slot_key=raw.get("slot_key"),
            sku=raw.get("sku"),
        )
        if item.id in seen:
            raise HTTPException(
                status_code=409,
                detail=f"Товар {item.id} указан в акте дважды",
            )
        seen.add(item.id)
        resolved.append(item)

    task = WarehouseTask(
        warehouse_id=wid,
        task_type="count",
        status="pending",
        priority=0,
        payload={
            "mode": mode_n,
            "reason": reason,
            "planned_via": "inventory_counting",
            "item_ids": [str(i.id) for i in resolved],
            "lines": [
                {
                    "item_id": str(i.id),
                    "sku": i.sku,
                    "slot_key": _item_slot_key(i),
                    "system_qty": int(i.quantity or 0),
                }
                for i in resolved
            ],
        },
        created_at=now,
        updated_at=now,
    )
    session.add(task)
    session.flush()

    act = InventoryCountAct(
        warehouse_id=wid,
        warehouse_task_id=task.id,
        status=STATUS_DRAFT,
        mode=mode_n,
        reason=reason,
        actor_user_id=actor_user_id,
        created_at=now,
        updated_at=now,
    )
    session.add(act)
    session.flush()

    for item in resolved:
        session.add(
            InventoryCountLine(
                act_id=act.id,
                item_id=item.id,
                slot_key=_item_slot_key(item),
                sku=item.sku,
                system_qty=int(item.quantity or 0),
                counted_qty=None,
                variance=None,
                created_at=now,
                updated_at=now,
            )
        )
    session.flush()
    return act


def enter_facts(
    session: Session,
    act: InventoryCountAct,
    *,
    facts: list[dict[str, Any]],
) -> list[InventoryCountLine]:
    """Вносит факт пересчёта и считает variance. Не коммитит."""
    if act.status == STATUS_POSTED:
        raise HTTPException(
            status_code=409, detail="Акт уже проведён — факты менять нельзя"
        )
    lines = load_lines(session, act.id)
    by_item = {ln.item_id: ln for ln in lines}
    now = _now()
    for fact in facts:
        iid = fact.get("item_id")
        if iid is None:
            raise HTTPException(status_code=422, detail="В факте нужен item_id")
        try:
            item_id = uuid.UUID(str(iid))
        except ValueError as exc:
            raise HTTPException(
                status_code=422, detail="Некорректный item_id"
            ) from exc
        line = by_item.get(item_id)
        if line is None:
            raise HTTPException(
                status_code=404,
                detail=f"Строка акта для товара {item_id} не найдена",
            )
        try:
            raw_counted = fact.get("counted_quantity")
            if raw_counted is None:
                raise TypeError("counted_quantity is required")
            counted = int(raw_counted)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=422, detail="counted_quantity должно быть целым ≥ 0"
            ) from exc
        if counted < 0:
            raise HTTPException(
                status_code=422, detail="counted_quantity не может быть отрицательным"
            )
        line.counted_qty = counted
        line.variance = counted - int(line.system_qty)
        line.updated_at = now
        session.add(line)

    act.updated_at = now
    session.add(act)
    session.flush()
    return load_lines(session, act.id)


def post_act(
    session: Session,
    act: InventoryCountAct,
    *,
    actor_user_id: uuid.UUID,
    reason: str | None = None,
) -> tuple[InventoryCountAct, list[InventoryCountLine], bool]:
    """
    Проводит акт: обновляет остатки, проекцию, события.
    Повторное проведение того же акта — идемпотентно. Не коммитит.
    """
    lines = load_lines(session, act.id)
    if act.status == STATUS_POSTED:
        return act, lines, True

    missing = [ln for ln in lines if ln.counted_qty is None]
    if missing:
        raise HTTPException(
            status_code=409,
            detail=(
                "Нельзя провести акт: нет факта по "
                f"{len(missing)} строк(е/ам)"
            ),
        )

    now = _now()
    if reason:
        act.reason = reason

    for line in lines:
        item = session.exec(
            select(Item).where(Item.id == line.item_id).with_for_update()
        ).first()
        if item is None:
            raise HTTPException(
                status_code=404, detail=f"Товар {line.item_id} не найден"
            )
        counted = int(line.counted_qty or 0)
        old_qty = int(item.quantity or 0)
        # Снимок на момент проведения (если остаток успел измениться — фиксируем факт)
        line.system_qty = old_qty
        line.variance = counted - old_qty
        line.updated_at = now
        session.add(line)

        if counted == old_qty:
            # всё равно событие counted для аудита пересчёта
            pass
        else:
            session.add(
                ItemHistory(
                    item_id=item.id,
                    user_id=actor_user_id,
                    field_name="quantity",
                    old_value=str(old_qty),
                    new_value=str(counted),
                )
            )
        item.quantity = counted
        reserved = int(item.reserved_quantity or 0)
        if reserved > counted:
            item.reserved_quantity = counted
        if counted == 0:
            item.storage_row = None
            item.storage_level = None
            item.storage_cell_x = None
            item.storage_cell_z = None
        session.add(item)
        session.flush()
        sync_projection_for_item(session, item)

        slot = line.slot_key or _item_slot_key(item)
        emit_domain_event(
            session,
            event_type=catalog.EVENT_INVENTORY_COUNTED,
            aggregate_type="inventory_count_act",
            aggregate_id=act.id,
            actor_user_id=actor_user_id,
            payload={
                "schema_version": 1,
                "warehouse_id": str(act.warehouse_id),
                "item_id": str(item.id),
                "quantity": counted,
                "slot_key": slot,
                "reference": str(act.id),
                "meta": {
                    "source": "inventory_counting",
                    "act_id": str(act.id),
                    "system_qty": old_qty,
                    "counted_qty": counted,
                    "variance": counted - old_qty,
                    "reason": act.reason,
                },
            },
            strict_payload=False,
        )
        if counted != old_qty:
            emit_domain_event(
                session,
                event_type=catalog.EVENT_INVENTORY_ADJUSTED,
                aggregate_type="inventory_count_act",
                aggregate_id=act.id,
                actor_user_id=actor_user_id,
                payload={
                    "schema_version": 1,
                    "warehouse_id": str(act.warehouse_id),
                    "item_id": str(item.id),
                    "quantity": counted,
                    "slot_key": slot,
                    "reference": str(act.id),
                    "meta": {
                        "source": "inventory_counting",
                        "act_id": str(act.id),
                        "delta": counted - old_qty,
                        "reason": act.reason,
                    },
                },
                strict_payload=False,
            )

    act.status = STATUS_POSTED
    act.actor_user_id = actor_user_id
    act.posted_at = now
    act.updated_at = now
    session.add(act)

    if act.warehouse_task_id:
        task = session.get(WarehouseTask, act.warehouse_task_id)
        if task is not None:
            payload = dict(task.payload) if isinstance(task.payload, dict) else {}
            payload["posted_act_id"] = str(act.id)
            payload["posted_at"] = now.isoformat()
            task.payload = payload
            task.status = "completed"
            task.updated_at = now
            session.add(task)

    session.flush()
    return act, load_lines(session, act.id), False


def list_acts(
    session: Session,
    *,
    skip: int = 0,
    limit: int = 100,
    status: str | None = None,
) -> tuple[list[InventoryCountAct], int]:
    stmt = select(InventoryCountAct)
    count_stmt = select(func.count()).select_from(InventoryCountAct)
    if status:
        stmt = stmt.where(InventoryCountAct.status == status)
        count_stmt = count_stmt.where(InventoryCountAct.status == status)
    total = int(session.exec(count_stmt).one())
    rows = list(
        session.exec(
            stmt.order_by(col(InventoryCountAct.created_at).desc())
            .offset(skip)
            .limit(limit)
        ).all()
    )
    return rows, total
