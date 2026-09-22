"""Готовность исходящего заказа к физической отгрузке (order-level, не Item.status)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import String, cast, or_
from sqlmodel import Session, col, func, select

from app.core.audit import log_audit
from app.core.permissions import can_change_status
from app.events import catalog
from app.models import (
    DomainEvent,
    Item,
    ItemHistory,
    OutboundEquipmentView,
    OutboundEventView,
    OutboundFulfillmentDetail,
    OutboundFulfillmentList,
    OutboundFulfillmentPublic,
    OutboundLineView,
    OutboundLinkedItem,
    OutboundOrder,
    OutboundTaskView,
    OutboundTimelineEvent,
    Shipment,
    User,
    WarehouseTask,
)
from app.realtime.item_sse_hub import publish_items_changed
from app.realtime.twin_stream_hub import (
    publish_item_movement,
    publish_occupancy_changed,
    publish_telemetry_fact,
)
from app.services.domain_events import EVENT_ITEM_STATUS_CHANGED, emit_domain_event
from app.services.warehouse_slot_projection import sync_projection_for_item
from app.warehouse_sim.models import SimDevice, SimEvent

READY_STATUS = "packed"
SHIPPED_STATUS = "shipped"
TERMINAL_STATUSES = frozenset({"shipped", "closed", "cancelled"})
OPEN_TASK_STATUSES = frozenset({"pending", "in_progress", "blocked"})
DONE_TASK_STATUSES = frozenset({"completed", "cancelled"})


def parse_line_items(lines: dict[str, Any] | list[Any] | None) -> list[dict[str, Any]]:
    if not lines:
        return []
    if isinstance(lines, list):
        return [row for row in lines if isinstance(row, dict)]
    if isinstance(lines, dict):
        items = lines.get("items")
        if isinstance(items, list):
            return [row for row in items if isinstance(row, dict)]
    return []


def line_metrics(lines: dict[str, Any] | list[Any] | None) -> tuple[int, int, int]:
    rows = parse_line_items(lines)
    items_count = len(rows)
    pallets = 0
    quantity = 0
    for row in rows:
        pallet_n = int(row.get("pallets") or 0)
        qty = int(row.get("quantity") or row.get("qty") or pallet_n or 0)
        pallets += pallet_n
        quantity += qty
    if pallets == 0:
        pallets = items_count
    if quantity == 0:
        quantity = pallets
    return items_count, quantity, pallets


def customer_of(order: OutboundOrder) -> str | None:
    extra = order.extra if isinstance(order.extra, dict) else {}
    lines = order.lines if isinstance(order.lines, dict) else {}
    raw = extra.get("customer") or lines.get("customer")
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def resolve_outbound_id(session: Session, token: str) -> uuid.UUID | None:
    """WMS UUID исходящего заказа по UUID или строковому sim_id из extra."""
    text = token.strip()
    if not text:
        return None
    try:
        parsed = uuid.UUID(text)
    except ValueError:
        parsed = None
    if parsed is not None:
        row = session.get(OutboundOrder, parsed)
        if row is not None:
            return row.id
    row = session.exec(
        select(OutboundOrder).where(OutboundOrder.extra.contains({"sim_id": text}))
    ).first()
    return row.id if row is not None else None


def annotate_event_orders(
    session: Session, events: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Добавляет wmsOrderId в ответ, не меняя сохранённый payload события."""
    mapping: dict[str, str] = {}
    for event in events:
        raw = event.get("orderId")
        if not raw:
            continue
        token = str(raw)
        if token in mapping:
            continue
        found = resolve_outbound_id(session, token)
        if found is not None:
            mapping[token] = str(found)
    annotated: list[dict[str, Any]] = []
    for event in events:
        copy = dict(event)
        raw = copy.get("orderId")
        if raw and str(raw) in mapping:
            copy["wmsOrderId"] = mapping[str(raw)]
        annotated.append(copy)
    return annotated


def sim_order_id(order: OutboundOrder) -> str | None:
    extra = order.extra if isinstance(order.extra, dict) else {}
    raw = extra.get("sim_id")
    return str(raw) if raw else None


def related_tasks(session: Session, order: OutboundOrder) -> list[WarehouseTask]:
    sid = sim_order_id(order)
    oid = str(order.id)
    rows = session.exec(
        select(WarehouseTask).where(WarehouseTask.warehouse_id == order.warehouse_id)
    ).all()
    matched: list[WarehouseTask] = []
    for task in rows:
        payload = task.payload if isinstance(task.payload, dict) else {}
        refs = {
            str(payload.get("sim_order_id") or ""),
            str(payload.get("order_id") or ""),
            str(payload.get("orderId") or ""),
        }
        refs.discard("")
        if (sid and sid in refs) or oid in refs:
            matched.append(task)
    return matched


def _payload_text(payload: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        raw = payload.get(key)
        if raw:
            return str(raw)
    return None


def related_equipment(
    session: Session, tasks: list[WarehouseTask]
) -> list[OutboundEquipmentView]:
    raw_ids: list[str] = []
    for task in tasks:
        payload = task.payload if isinstance(task.payload, dict) else {}
        token = _payload_text(payload, "equipment_id", "device_id", "deviceId")
        if token:
            raw_ids.append(token)
    found: list[OutboundEquipmentView] = []
    seen: set[str] = set()
    for token in raw_ids:
        if token in seen:
            continue
        seen.add(token)
        device = None
        try:
            device = session.get(SimDevice, uuid.UUID(token))
        except ValueError:
            device = session.exec(select(SimDevice).where(SimDevice.code == token)).first()
        if device is None:
            continue
        found.append(
            OutboundEquipmentView(id=str(device.id), name=device.name, code=device.code)
        )
    return found


def related_order_events(
    session: Session,
    order: OutboundOrder,
    domain_events: list[DomainEvent],
) -> list[OutboundEventView]:
    rows: list[OutboundEventView] = []
    seen: set[str] = set()
    for event in domain_events:
        token = str(event.id)
        seen.add(token)
        rows.append(
            OutboundEventView(
                id=token,
                at=event.occurred_at,
                event_type=event.event_type,
                message=str((event.payload or {}).get("message") or event.event_type),
                severity=None,
                device_id=None,
            )
        )
    needles = [str(order.id)]
    sim_id = sim_order_id(order)
    if sim_id:
        needles.append(sim_id)
    sim_rows = session.exec(
        select(SimEvent)
        .where(
            or_(
                SimEvent.order_id == order.id,
                *[SimEvent.payload.contains({"orderId": needle}) for needle in needles],
            )
        )
        .order_by(SimEvent.seq.desc())
        .limit(40)
    ).all()
    for event in sim_rows:
        token = str(event.id)
        if token in seen:
            continue
        seen.add(token)
        payload = event.payload or {}
        rows.append(
            OutboundEventView(
                id=token,
                at=event.occurred_at,
                event_type=event.event_type,
                message=event.message,
                severity=event.severity,
                device_id=str(event.device_id or payload.get("deviceId") or "") or None,
            )
        )
    rows.sort(key=lambda row: row.at)
    return rows[-40:]


def picking_complete(order: OutboundOrder, tasks: list[WarehouseTask]) -> bool:
    if order.status in {READY_STATUS, SHIPPED_STATUS, "closed"}:
        pick = [t for t in tasks if t.task_type == "pick"]
        if pick:
            return all(t.status in DONE_TASK_STATUSES for t in pick)
        return True
    pick = [t for t in tasks if t.task_type == "pick"]
    if not pick:
        return False
    return all(t.status in DONE_TASK_STATUSES for t in pick)


def packing_complete(order: OutboundOrder) -> bool:
    return order.status in {READY_STATUS, SHIPPED_STATUS, "closed"}


def is_ready_for_shipment(order: OutboundOrder, tasks: list[WarehouseTask]) -> bool:
    if order.status in TERMINAL_STATUSES:
        return False
    if order.status != READY_STATUS:
        return False
    return picking_complete(order, tasks) and packing_complete(order)


def _transport(order: OutboundOrder, shipment: Shipment | None) -> dict[str, Any]:
    extra = order.extra if isinstance(order.extra, dict) else {}
    ship_extra = shipment.extra if shipment and isinstance(shipment.extra, dict) else {}
    label = (
        extra.get("plate")
        or ship_extra.get("plate")
        or extra.get("sim_truck_id")
        or ship_extra.get("sim_id")
        or (shipment.reference if shipment else None)
    )
    status = shipment.status if shipment else None
    assigned = order.shipment_id is not None
    return {
        "transport_id": order.shipment_id,
        "transport_label": str(label) if label else None,
        "transport_status": status,
        "transport_assigned": assigned,
    }


def to_public(
    order: OutboundOrder,
    *,
    shipment: Shipment | None = None,
    tasks: list[WarehouseTask] | None = None,
) -> OutboundFulfillmentPublic:
    task_rows = tasks if tasks is not None else []
    items_count, total_quantity, pallets_count = line_metrics(order.lines)
    pick_ok = picking_complete(order, task_rows)
    pack_ok = packing_complete(order)
    transport = _transport(order, shipment)
    ready_at = order.updated_at if order.status in {READY_STATUS, SHIPPED_STATUS} else None
    return OutboundFulfillmentPublic(
        id=order.id,
        warehouse_id=order.warehouse_id,
        code=order.code,
        status=order.status,
        shipment_id=order.shipment_id,
        ship_by_at=order.ship_by_at,
        lines=order.lines,
        extra=order.extra,
        created_at=order.created_at,
        updated_at=order.updated_at,
        customer=customer_of(order),
        items_count=items_count,
        total_quantity=total_quantity,
        pallets_count=pallets_count,
        picking_status="complete" if pick_ok else "pending",
        packing_status="complete" if pack_ok else "pending",
        ready_at=ready_at,
        **transport,
    )


def related_items(session: Session, order: OutboundOrder, tasks: list[WarehouseTask]) -> list[Item]:
    ids: set[uuid.UUID] = set()
    for task in tasks:
        payload = task.payload if isinstance(task.payload, dict) else {}
        raw = payload.get("item_id")
        if not raw:
            continue
        try:
            ids.add(uuid.UUID(str(raw)))
        except ValueError:
            continue
    extra = order.extra if isinstance(order.extra, dict) else {}
    for raw in extra.get("pallet_item_ids") or extra.get("item_ids") or []:
        try:
            ids.add(uuid.UUID(str(raw)))
        except ValueError:
            continue
    found: list[Item] = []
    if ids:
        found.extend(session.exec(select(Item).where(col(Item.id).in_(ids))).all())
    sku_ids = {
        str(row.get("skuId") or row.get("sku") or "").strip()
        for row in parse_line_items(order.lines)
    }
    sku_ids.discard("")
    if sku_ids:
        sku_items = session.exec(
            select(Item).where(
                col(Item.sku).in_(sku_ids),
                col(Item.status).in_(("shipment", "shipped")),
            )
        ).all()
        have = {row.id for row in found}
        for item in sku_items:
            if item.id not in have:
                found.append(item)
                have.add(item.id)
    return found


def _timeline(
    order: OutboundOrder,
    tasks: list[WarehouseTask],
    events: list[DomainEvent],
) -> list[OutboundTimelineEvent]:
    rows: list[OutboundTimelineEvent] = [
        OutboundTimelineEvent(at=order.created_at, kind="created", label="Создан")
    ]
    pick_started = next(
        (t for t in tasks if t.task_type == "pick" and t.status in {"in_progress", "completed"}),
        None,
    )
    if pick_started or order.status in {"picking", READY_STATUS, SHIPPED_STATUS}:
        at = pick_started.updated_at if pick_started else order.updated_at
        rows.append(OutboundTimelineEvent(at=at, kind="picking_started", label="Picking начат"))
    if picking_complete(order, tasks):
        pick_done = [t for t in tasks if t.task_type == "pick" and t.status == "completed"]
        at = max((t.updated_at for t in pick_done), default=order.updated_at)
        rows.append(OutboundTimelineEvent(at=at, kind="picking_completed", label="Picking завершён"))
    if packing_complete(order):
        rows.append(
            OutboundTimelineEvent(
                at=order.updated_at,
                kind="packing_completed",
                label="Packing завершён",
            )
        )
        rows.append(
            OutboundTimelineEvent(
                at=order.updated_at,
                kind="ready",
                label="Готов к отгрузке",
            )
        )
    if order.status == SHIPPED_STATUS:
        rows.append(
            OutboundTimelineEvent(at=order.updated_at, kind="shipped", label="Отгружен")
        )
    for ev in events:
        label = ev.event_type
        rows.append(OutboundTimelineEvent(at=ev.occurred_at, kind=ev.event_type, label=label))
    rows.sort(key=lambda row: row.at)
    return rows


def to_detail(
    session: Session,
    order: OutboundOrder,
    *,
    shipment: Shipment | None,
    tasks: list[WarehouseTask],
) -> OutboundFulfillmentDetail:
    base = to_public(order, shipment=shipment, tasks=tasks)
    items = related_items(session, order, tasks)
    events = session.exec(
        select(DomainEvent)
        .where(DomainEvent.aggregate_id == order.id)
        .order_by(DomainEvent.occurred_at.asc())
        .limit(40)
    ).all()
    return OutboundFulfillmentDetail(
        **base.model_dump(),
        line_items=[
            OutboundLineView(
                sku_id=str(row.get("skuId") or row.get("sku") or "") or None,
                pallets=int(row.get("pallets") or 0),
                picked=int(row.get("picked") or 0),
                quantity=int(row.get("quantity") or row.get("qty") or row.get("pallets") or 0),
            )
            for row in parse_line_items(order.lines)
        ],
        tasks=[
            OutboundTaskView(
                id=task.id,
                task_type=task.task_type,
                status=task.status,
                updated_at=task.updated_at,
                source=_payload_text(task.payload or {}, "source", "from_zone", "source_zone"),
                destination=_payload_text(
                    task.payload or {}, "destination", "to_zone", "destination_zone"
                ),
                equipment_id=_payload_text(
                    task.payload or {}, "equipment_id", "device_id", "deviceId"
                ),
            )
            for task in tasks
        ],
        items=[
            OutboundLinkedItem(
                id=item.id,
                sku=item.sku,
                title=item.title,
                status=item.status,
                quantity=item.quantity,
            )
            for item in items
        ],
        timeline=_timeline(order, tasks, events),
        equipment=related_equipment(session, tasks),
        events=related_order_events(session, order, list(events)),
    )


def _apply_board_filters(
    stmt: Any,
    *,
    search: str | None,
    customer: str | None,
    transport: str | None,
    ready_date: str | None,
) -> Any:
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                col(OutboundOrder.code).ilike(q),
                cast(OutboundOrder.extra, String).ilike(q),
            )
        )
    if customer and customer.strip():
        q = f"%{customer.strip()}%"
        stmt = stmt.where(cast(OutboundOrder.extra, String).ilike(q))
    if transport == "assigned":
        stmt = stmt.where(OutboundOrder.shipment_id.is_not(None))
    elif transport == "unassigned":
        stmt = stmt.where(OutboundOrder.shipment_id.is_(None))
    if ready_date and ready_date.strip():
        try:
            day = date.fromisoformat(ready_date.strip())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Некорректная дата готовности") from exc
        start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        stmt = stmt.where(
            OutboundOrder.updated_at >= start,
            OutboundOrder.updated_at < start + timedelta(days=1),
        )
    return stmt


def list_board(
    session: Session,
    *,
    status: str,
    skip: int,
    limit: int,
    search: str | None = None,
    customer: str | None = None,
    transport: str | None = None,
    ready_date: str | None = None,
) -> OutboundFulfillmentList:
    stmt = select(OutboundOrder).where(OutboundOrder.status == status)
    count_stmt = select(func.count()).select_from(OutboundOrder).where(
        OutboundOrder.status == status
    )
    stmt = _apply_board_filters(
        stmt,
        search=search,
        customer=customer,
        transport=transport,
        ready_date=ready_date,
    )
    count_stmt = _apply_board_filters(
        count_stmt,
        search=search,
        customer=customer,
        transport=transport,
        ready_date=ready_date,
    )
    count = session.exec(count_stmt).one()
    rows = list(
        session.exec(
            stmt.order_by(OutboundOrder.updated_at.desc()).offset(skip).limit(limit)
        ).all()
    )
    shipment_ids = [row.shipment_id for row in rows if row.shipment_id]
    shipments: dict[uuid.UUID, Shipment] = {}
    if shipment_ids:
        for ship in session.exec(select(Shipment).where(col(Shipment.id).in_(shipment_ids))).all():
            shipments[ship.id] = ship
    data: list[OutboundFulfillmentPublic] = []
    for order in rows:
        tasks = related_tasks(session, order)
        if status == READY_STATUS and not is_ready_for_shipment(order, tasks):
            continue
        data.append(
            to_public(
                order,
                shipment=shipments.get(order.shipment_id) if order.shipment_id else None,
                tasks=tasks,
            )
        )
    ready_count = len(data) if status == READY_STATUS else count
    items_count = sum(row.items_count for row in data)
    pallets_count = sum(row.pallets_count for row in data)
    awaiting_transport = sum(1 for row in data if not row.transport_assigned)
    return OutboundFulfillmentList(
        data=data,
        count=len(data) if status == READY_STATUS else count,
        ready_count=ready_count,
        items_count=items_count,
        pallets_count=pallets_count,
        awaiting_transport=awaiting_transport,
    )


def _ship_item(session: Session, item: Item, user: User) -> None:
    if item.status == SHIPPED_STATUS:
        return
    if item.status not in {"shipment", "warehouse"}:
        return
    old_status = item.status
    if item.storage_row is not None:
        session.add(
            ItemHistory(
                item_id=item.id,
                user_id=user.id,
                field_name="storage_row",
                old_value=str(item.storage_row or ""),
                new_value="",
            )
        )
    item.storage_row = None
    item.storage_level = None
    item.storage_cell_x = None
    item.storage_cell_z = None
    item.location = "shipped"
    item.status = SHIPPED_STATUS
    session.add(
        ItemHistory(
            item_id=item.id,
            user_id=user.id,
            field_name="status",
            old_value=old_status,
            new_value=SHIPPED_STATUS,
        )
    )
    emit_domain_event(
        session,
        event_type=EVENT_ITEM_STATUS_CHANGED,
        aggregate_type="item",
        aggregate_id=item.id,
        actor_user_id=user.id,
        payload={"from": old_status, "to": SHIPPED_STATUS},
    )
    emit_domain_event(
        session,
        event_type=catalog.EVENT_INVENTORY_SHIPPED,
        aggregate_type="item",
        aggregate_id=item.id,
        actor_user_id=user.id,
        payload={
            "schema_version": 1,
            "item_id": str(item.id),
            "quantity": item.quantity,
            "reference": item.barcode,
            "meta": {"source": "outbound_fulfillment"},
        },
        strict_payload=False,
    )
    session.add(item)
    sync_projection_for_item(session, item)


def ship_order(session: Session, user: User, order_id: uuid.UUID) -> OutboundFulfillmentDetail:
    if not can_change_status(session, user):
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    order = session.get(OutboundOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Исходящий заказ не найден")
    tasks = related_tasks(session, order)
    if order.status == SHIPPED_STATUS:
        raise HTTPException(status_code=409, detail="Заказ уже отгружен")
    if order.status in TERMINAL_STATUSES:
        raise HTTPException(status_code=409, detail="Заказ нельзя отгрузить")
    if not picking_complete(order, tasks):
        raise HTTPException(status_code=400, detail="Комплектация не завершена")
    if not packing_complete(order):
        raise HTTPException(status_code=400, detail="Упаковка не завершена")
    if not is_ready_for_shipment(order, tasks):
        raise HTTPException(status_code=400, detail="Заказ не готов к отгрузке")

    now = datetime.now(timezone.utc)
    items = related_items(session, order, tasks)
    item_ids: list[uuid.UUID] = []
    for item in items:
        _ship_item(session, item, user)
        item_ids.append(item.id)

    order.status = SHIPPED_STATUS
    order.updated_at = now
    session.add(order)

    shipment = session.get(Shipment, order.shipment_id) if order.shipment_id else None
    if shipment and shipment.status != SHIPPED_STATUS:
        shipment.status = SHIPPED_STATUS
        shipment.updated_at = now
        session.add(shipment)

    emit_domain_event(
        session,
        event_type=catalog.EVENT_INVENTORY_SHIPPED,
        aggregate_type="outbound_order",
        aggregate_id=order.id,
        actor_user_id=user.id,
        payload={
            "schema_version": 1,
            "reference": order.code,
            "meta": {
                "source": "outbound_fulfillment",
                "order_id": str(order.id),
                "item_ids": [str(i) for i in item_ids],
            },
        },
        strict_payload=False,
    )
    log_audit(
        session,
        user_id=user.id,
        action="outbound.ship",
        resource_type="outbound_order",
        resource_id=order.id,
        details={"code": order.code, "status": SHIPPED_STATUS},
    )
    session.commit()
    session.refresh(order)
    if shipment:
        session.refresh(shipment)
    publish_items_changed()
    for iid in item_ids[:12]:
        publish_item_movement(item_id=iid, reason="outbound_shipped")
    if item_ids:
        publish_occupancy_changed()
    publish_telemetry_fact(
        event_type="wms.outbound_shipped",
        payload={"order_id": str(order.id), "code": order.code},
    )
    return to_detail(session, order, shipment=shipment, tasks=related_tasks(session, order))
