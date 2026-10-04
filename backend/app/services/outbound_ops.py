"""
Операции исходящего заказа: подтверждение отбора (scan-verify), упаковка, инциденты.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, col, select

from app.events import catalog
from app.models import (
    NOTIFICATION_SEVERITY_WARNING,
    Item,
    OutboundOrder,
    TaskExecution,
    User,
    WarehouseTask,
)
from app.services.domain_events import emit_domain_event
from app.services.item_reservation import (
    consume_for_task as _consume_for_task,
)
from app.services.item_reservation import (
    release_for_task,
    reserve_for_task,
)
from app.services.notification_service import create_notification
from app.services.outbound_fulfillment import (
    DONE_TASK_STATUSES,
    OPEN_TASK_STATUSES,
    READY_STATUS,
    parse_line_items,
    related_tasks,
)
from app.services.outbound_planning import (
    PICKING_STATUS,
    _candidate_items,
    _slot_dict,
    sync_outbound_status_from_tasks,
)

OUTCOME_OK = "ok"
OUTCOME_NO_STOCK = "no_stock"
CONFIRM_OUTCOMES = frozenset({OUTCOME_OK, OUTCOME_NO_STOCK})


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fulfillment(order: OutboundOrder) -> tuple[dict[str, Any], dict[str, Any]]:
    extra = dict(order.extra) if isinstance(order.extra, dict) else {}
    prev = extra.get("fulfillment")
    ff = dict(prev) if isinstance(prev, dict) else {}
    return extra, ff


def _save_fulfillment(
    order: OutboundOrder, extra: dict[str, Any], ff: dict[str, Any]
) -> None:
    extra["fulfillment"] = ff
    order.extra = extra
    order.updated_at = _now()
    # session.add вызывающий


def lookup_item_by_code(session: Session, code: str) -> Item | None:
    text = (code or "").strip()
    if not text:
        return None
    return session.exec(
        select(Item).where((col(Item.barcode) == text) | (col(Item.sku) == text))
    ).first()


def open_incidents(order: OutboundOrder) -> list[dict[str, Any]]:
    _, ff = _fulfillment(order)
    raw = ff.get("incidents")
    if not isinstance(raw, list):
        return []
    return [
        dict(x)
        for x in raw
        if isinstance(x, dict) and x.get("status") in {None, "open"}
    ]


def _set_incidents(order: OutboundOrder, incidents: list[dict[str, Any]]) -> None:
    extra, ff = _fulfillment(order)
    ff["incidents"] = incidents
    _save_fulfillment(order, extra, ff)


def _pick_task_for_order(
    session: Session, order: OutboundOrder, task_id: uuid.UUID
) -> WarehouseTask:
    task = session.get(WarehouseTask, task_id)
    if task is None or task.task_type != "pick":
        raise HTTPException(status_code=404, detail="Задание отбора не найдено")
    payload = task.payload if isinstance(task.payload, dict) else {}
    if str(payload.get("order_id") or "") != str(order.id):
        raise HTTPException(
            status_code=409, detail="Задание не относится к этому заказу"
        )
    return task


def _suggest_alternative(
    session: Session, *, sku: str | None, exclude_item_id: uuid.UUID | None
) -> dict[str, Any] | None:
    for item in _candidate_items(session, sku=sku, item_id=None):
        if exclude_item_id is not None and item.id == exclude_item_id:
            continue
        slot = _slot_dict(item)
        return {
            "item_id": str(item.id),
            "sku": item.sku,
            **slot,
        }
    return None


def _notify_no_stock(
    session: Session,
    *,
    order: OutboundOrder,
    task: WarehouseTask,
    reason: str,
    actor_user_id: uuid.UUID | None,
) -> None:
    payload = task.payload if isinstance(task.payload, dict) else {}
    title = f"Нет товара при отборе {order.code}"
    body = (
        f"SKU {payload.get('sku') or '—'}, ячейка {payload.get('slot_key') or '—'}: "
        f"{reason}"
    )
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
            type="outbound.pick_incident",
            severity=NOTIFICATION_SEVERITY_WARNING,
            title=title,
            body=body,
            source="outbound_ops",
            entity_type="outbound_order",
            entity_id=order.id,
        )


def _bump_line_picked(
    order: OutboundOrder, *, line_index: int | None, qty: int
) -> None:
    if line_index is None or qty <= 0:
        return
    raw = order.lines if isinstance(order.lines, dict) else {}
    container = dict(raw)
    items = container.get("items")
    if not isinstance(items, list) or line_index < 0 or line_index >= len(items):
        return
    line = dict(items[line_index]) if isinstance(items[line_index], dict) else {}
    prev = int(line.get("picked") or 0)
    line["picked"] = prev + qty
    items = list(items)
    items[line_index] = line
    container["items"] = items
    order.lines = container


def _verify_scan(
    session: Session,
    task: WarehouseTask,
    *,
    scanned_code: str,
    scanned_slot_key: str | None,
) -> Item:
    item = lookup_item_by_code(session, scanned_code)
    if item is None:
        raise HTTPException(status_code=404, detail="Товар по коду скана не найден")
    payload = task.payload if isinstance(task.payload, dict) else {}
    expected_id = payload.get("item_id")
    expected_sku = (payload.get("sku") or "").strip()
    if expected_id and str(item.id) != str(expected_id):
        # допускается альтернатива, если SKU совпал и в payload помечен alt
        if not expected_sku or (item.sku or "").strip() != expected_sku:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Скан не совпал с заданием: ожидали "
                    f"item={expected_id}/sku={expected_sku or '—'}, "
                    f"получен {item.id}/{item.sku or '—'}"
                ),
            )
    elif expected_sku and (item.sku or "").strip() != expected_sku:
        raise HTTPException(
            status_code=409,
            detail=f"SKU скана «{item.sku}» не совпадает с заданием «{expected_sku}»",
        )
    if scanned_slot_key:
        expected_slot = payload.get("slot_key")
        if expected_slot and str(scanned_slot_key) != str(expected_slot):
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Ячейка скана «{scanned_slot_key}» не совпадает "
                    f"с заданием «{expected_slot}»"
                ),
            )
    return item


def confirm_pick(
    session: Session,
    order: OutboundOrder,
    *,
    task_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    outcome: str = OUTCOME_OK,
    scanned_code: str | None = None,
    scanned_slot_key: str | None = None,
    quantity: int | None = None,
    reason: str | None = None,
) -> dict[str, Any]:
    """Подтверждение отбора или инцидент «нет товара». Не коммитит."""
    outcome_n = (outcome or OUTCOME_OK).strip().lower()
    if outcome_n not in CONFIRM_OUTCOMES:
        raise HTTPException(status_code=422, detail="outcome: ok или no_stock")
    if order.status in {"shipped", "closed", "cancelled", "canceled"}:
        raise HTTPException(status_code=409, detail="Заказ в терминальном статусе")

    task = _pick_task_for_order(session, order, task_id)
    payload = dict(task.payload) if isinstance(task.payload, dict) else {}
    now = _now()

    if (
        task.status in DONE_TASK_STATUSES
        and payload.get("confirmed_at")
        and outcome_n == OUTCOME_OK
    ):
        return {
            "task_id": str(task.id),
            "status": task.status,
            "idempotent": True,
            "incident": None,
            "alternative": None,
        }

    if outcome_n == OUTCOME_NO_STOCK:
        if task.status in DONE_TASK_STATUSES:
            raise HTTPException(status_code=409, detail="Задание уже завершено")
        release_for_task(session, task)
        alt = _suggest_alternative(
            session,
            sku=str(payload.get("sku") or "") or None,
            exclude_item_id=(
                uuid.UUID(str(payload["item_id"])) if payload.get("item_id") else None
            ),
        )
        incident = {
            "id": str(uuid.uuid4()),
            "type": "no_stock",
            "status": "open",
            "task_id": str(task.id),
            "line_key": payload.get("line_key"),
            "sku": payload.get("sku"),
            "slot_key": payload.get("slot_key"),
            "reason": (reason or "Нет товара в ячейке").strip(),
            "alternative": alt,
            "created_at": now.isoformat(),
        }
        payload["incident"] = incident
        payload["confirmed_at"] = None
        task.payload = payload
        task.status = "blocked"
        task.updated_at = now
        session.add(task)

        incidents = [
            i for i in open_incidents(order) if str(i.get("task_id")) != str(task.id)
        ]
        incidents.append(incident)
        # сохранить и закрытые
        extra, ff = _fulfillment(order)
        raw_inc = ff.get("incidents")
        prev: list[Any] = raw_inc if isinstance(raw_inc, list) else []
        kept = [
            dict(x)
            for x in prev
            if isinstance(x, dict)
            and str(x.get("task_id")) != str(task.id)
            and x.get("status") not in {None, "open"}
        ]
        ff["incidents"] = kept + incidents
        if order.status in {"open", "confirmed", "picking_complete"}:
            order.status = PICKING_STATUS
        _save_fulfillment(order, extra, ff)
        session.add(order)

        _notify_no_stock(
            session,
            order=order,
            task=task,
            reason=str(incident["reason"]),
            actor_user_id=actor_user_id,
        )
        emit_domain_event(
            session,
            event_type=catalog.EVENT_ALERT_RAISED,
            aggregate_type="outbound_order",
            aggregate_id=order.id,
            actor_user_id=actor_user_id,
            payload={
                "schema_version": 1,
                "code": "pick_no_stock",
                "severity": "warning",
                "message": str(incident["reason"]),
                "entity_type": "warehouse_task",
                "entity_id": str(task.id),
                "meta": {"incident": incident},
            },
            strict_payload=False,
        )
        return {
            "task_id": str(task.id),
            "status": task.status,
            "idempotent": False,
            "incident": incident,
            "alternative": alt,
        }

    # outcome == ok
    if not scanned_code:
        raise HTTPException(
            status_code=422, detail="Для подтверждения отбора нужен scanned_code"
        )
    if task.status not in OPEN_TASK_STATUSES | {"pending", "in_progress", "blocked"}:
        raise HTTPException(
            status_code=409,
            detail=f"Нельзя подтвердить отбор в статусе «{task.status}»",
        )

    # При разрешении инцидента: переназначить на альтернативу по скану.
    scanned_item = lookup_item_by_code(session, scanned_code)
    if scanned_item is None:
        raise HTTPException(status_code=404, detail="Товар по коду скана не найден")
    expected_id = payload.get("item_id")
    if (
        task.status == "blocked"
        and expected_id
        and str(scanned_item.id) != str(expected_id)
    ):
        # смена ячейки/товара той же SKU
        if (scanned_item.sku or "").strip() != str(payload.get("sku") or "").strip():
            raise HTTPException(
                status_code=409,
                detail="Альтернативный товар должен быть того же SKU",
            )
        qty_need = int(
            quantity if quantity is not None else payload.get("quantity") or 1
        )
        release_for_task(session, task)  # на случай активного резерва
        slot = _slot_dict(scanned_item)
        payload.update(
            {
                "item_id": str(scanned_item.id),
                **slot,
                "replanned_from": expected_id,
            }
        )
        task.payload = payload
        session.add(task)
        session.flush()
        reserve_for_task(
            session,
            item_id=scanned_item.id,
            quantity=qty_need,
            warehouse_task_id=task.id,
            outbound_order_id=order.id,
        )
    else:
        _verify_scan(
            session,
            task,
            scanned_code=scanned_code,
            scanned_slot_key=scanned_slot_key,
        )
        # blocked на той же позиции: восстановить резерв
        if task.status == "blocked":
            qty_need = int(
                quantity if quantity is not None else payload.get("quantity") or 1
            )
            try:
                reserve_for_task(
                    session,
                    item_id=uuid.UUID(str(payload["item_id"])),
                    quantity=qty_need,
                    warehouse_task_id=task.id,
                    outbound_order_id=order.id,
                )
            except HTTPException:
                raise HTTPException(
                    status_code=409,
                    detail="Не удалось снова зарезервировать товар; выберите альтернативу",
                ) from None

    confirm_qty = int(
        quantity if quantity is not None else payload.get("quantity") or 1
    )
    if confirm_qty <= 0:
        raise HTTPException(status_code=422, detail="quantity должно быть > 0")

    payload["confirmed_at"] = now.isoformat()
    payload["scanned_code"] = scanned_code.strip()
    if scanned_slot_key:
        payload["scanned_slot_key"] = scanned_slot_key
    payload["confirmed_quantity"] = confirm_qty
    if payload.get("incident"):
        inc = dict(payload["incident"])
        inc["status"] = "resolved"
        inc["resolved_at"] = now.isoformat()
        payload["incident"] = inc
    task.payload = payload
    task.status = "completed"
    task.updated_at = now
    session.add(task)
    session.flush()
    session.add(
        TaskExecution(
            warehouse_task_id=task.id,
            status="completed",
            actor_user_id=actor_user_id,
            started_at=task.created_at,
            completed_at=now,
            result={
                "outcome": OUTCOME_OK,
                "quantity": confirm_qty,
                "lines": 1,
                "source": "outbound_ops.confirm_pick",
            },
        )
    )
    _consume_for_task(session, task)

    line_index = payload.get("line_index")
    try:
        line_idx = int(line_index) if line_index is not None else None
    except (TypeError, ValueError):
        line_idx = None
    _bump_line_picked(order, line_index=line_idx, qty=confirm_qty)

    # закрыть open-инцидент по задаче
    extra, ff = _fulfillment(order)
    raw_inc = ff.get("incidents")
    prior_incs: list[Any] = raw_inc if isinstance(raw_inc, list) else []
    new_incs: list[dict[str, Any]] = []
    for row in prior_incs:
        if not isinstance(row, dict):
            continue
        if str(row.get("task_id")) == str(task.id) and row.get("status") in {
            None,
            "open",
        }:
            closed = dict(row)
            closed["status"] = "resolved"
            closed["resolved_at"] = now.isoformat()
            new_incs.append(closed)
        else:
            new_incs.append(dict(row))
    ff["incidents"] = new_incs
    if order.status in {"open", "confirmed"}:
        order.status = PICKING_STATUS
    _save_fulfillment(order, extra, ff)
    session.add(order)

    item_id_raw = payload.get("item_id")
    item_uuid = uuid.UUID(str(item_id_raw)) if item_id_raw else None
    emit_domain_event(
        session,
        event_type=catalog.EVENT_INVENTORY_PICKED,
        aggregate_type="outbound_order",
        aggregate_id=order.id,
        actor_user_id=actor_user_id,
        payload={
            "schema_version": 1,
            "item_id": str(item_uuid) if item_uuid else None,
            "quantity": confirm_qty,
            "slot_key": payload.get("slot_key"),
            "reference": order.code,
            "meta": {
                "source": "outbound_ops",
                "task_id": str(task.id),
                "scanned_code": scanned_code.strip(),
            },
        },
        strict_payload=False,
    )
    sync_outbound_status_from_tasks(session, order)
    return {
        "task_id": str(task.id),
        "status": task.status,
        "idempotent": False,
        "incident": None,
        "alternative": None,
        "confirmed_quantity": confirm_qty,
        "item_id": str(item_uuid) if item_uuid else None,
    }


def lines_pick_complete(order: OutboundOrder, tasks: list[WarehouseTask]) -> list[str]:
    """Возвращает ключи строк с недобором по подтверждённому отбору."""
    picks = [t for t in tasks if t.task_type == "pick"]
    confirmed_by_line: dict[str, int] = {}
    for t in picks:
        payload = t.payload if isinstance(t.payload, dict) else {}
        if t.status != "completed" or not payload.get("confirmed_at"):
            continue
        base = str(payload.get("line_base_key") or payload.get("line_key") or "")
        base = base.split("#", 1)[0]
        if not base:
            continue
        confirmed_by_line[base] = confirmed_by_line.get(base, 0) + int(
            payload.get("confirmed_quantity") or payload.get("quantity") or 0
        )
    missing: list[str] = []
    for idx, line in enumerate(parse_line_items(order.lines)):
        need = int(line.get("quantity") or line.get("qty") or line.get("pallets") or 0)
        if need <= 0:
            continue
        raw = line.get("line_id") or line.get("lineId") or line.get("id")
        sku = line.get("skuId") or line.get("sku_id") or line.get("sku") or ""
        item_id = line.get("item_id") or line.get("itemId") or ""
        base = str(raw) if raw else f"{idx}:{sku}:{item_id}"
        got = confirmed_by_line.get(base, 0)
        if got < need:
            missing.append(f"{base} (отобрано {got} из {need})")
    return missing


def shipment_blockers(order: OutboundOrder, tasks: list[WarehouseTask]) -> list[str]:
    """Причины, почему нельзя отгрузить (пустой список = можно, если packed)."""
    blockers: list[str] = []
    picks = [t for t in tasks if t.task_type == "pick"]
    ops_picks = [
        t
        for t in picks
        if isinstance(t.payload, dict)
        and t.payload.get("planned_via") == "outbound_planning"
    ]
    if ops_picks:
        for t in ops_picks:
            payload = t.payload if isinstance(t.payload, dict) else {}
            if t.status == "blocked" or (
                isinstance(payload.get("incident"), dict)
                and payload["incident"].get("status") == "open"
            ):
                blockers.append(f"открытый инцидент отбора (задача {t.id})")
            elif t.status not in DONE_TASK_STATUSES:
                blockers.append(f"отбор не завершён (задача {t.id})")
            elif t.status == "completed" and not payload.get("confirmed_at"):
                blockers.append(f"отбор без подтверждения сканом (задача {t.id})")
        open_inc = open_incidents(order)
        if open_inc:
            blockers.append(f"открытых инцидентов: {len(open_inc)}")
        missing = lines_pick_complete(order, ops_picks)
        if missing:
            blockers.append("некомплект строк: " + "; ".join(missing[:5]))
        _, ff = _fulfillment(order)
        if order.status != READY_STATUS and not ff.get("packed_at"):
            blockers.append("упаковка не завершена")
        elif order.status == READY_STATUS and not ff.get("packed_at"):
            # legacy packed без pack_order — для ops_picks требуем packed_at
            blockers.append("нет факта упаковки (вызовите pack)")
    return blockers


def pack_order(
    session: Session,
    order: OutboundOrder,
    *,
    actor_user_id: uuid.UUID,
    handling_units: list[dict[str, Any]] | None = None,
) -> OutboundOrder:
    """Фиксация упаковки при полном отборе без открытых инцидентов. Не коммитит."""
    if order.status in {"shipped", "closed", "cancelled", "canceled"}:
        raise HTTPException(
            status_code=409, detail="Заказ нельзя упаковать в текущем статусе"
        )
    if order.status == READY_STATUS:
        _, ff0 = _fulfillment(order)
        if ff0.get("packed_at"):
            return order

    tasks = related_tasks(session, order)
    picks = [t for t in tasks if t.task_type == "pick"]
    if not picks:
        raise HTTPException(
            status_code=409,
            detail="Нет заданий отбора — упаковка через операции недоступна",
        )
    for t in picks:
        payload = t.payload if isinstance(t.payload, dict) else {}
        if t.status == "cancelled":
            continue
        if t.status != "completed" or not payload.get("confirmed_at"):
            raise HTTPException(
                status_code=409,
                detail="Нельзя упаковать: отбор не подтверждён по всем строкам",
            )
    if open_incidents(order):
        raise HTTPException(
            status_code=409,
            detail="Нельзя упаковать: есть открытые инциденты отбора",
        )
    missing = lines_pick_complete(order, picks)
    if missing:
        raise HTTPException(
            status_code=409,
            detail="Некомплект для упаковки: " + "; ".join(missing[:5]),
        )

    now = _now()
    extra, ff = _fulfillment(order)
    ff["packed_at"] = now.isoformat()
    ff["packed_by"] = str(actor_user_id)
    if handling_units:
        ff["handling_units"] = handling_units
    order.status = READY_STATUS
    _save_fulfillment(order, extra, ff)
    session.add(order)

    emit_domain_event(
        session,
        event_type=catalog.EVENT_INVENTORY_PACKED,
        aggregate_type="outbound_order",
        aggregate_id=order.id,
        actor_user_id=actor_user_id,
        payload={
            "schema_version": 1,
            "reference": order.code,
            "meta": {
                "source": "outbound_ops",
                "handling_units": handling_units or [],
            },
        },
        strict_payload=False,
    )
    return order
