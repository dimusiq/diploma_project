"""
Интеграционный слой: Simulation Event → существующие WMS-сервисы/модели.

Simulation Engine остаётся источником движения техники.
Единственный источник бизнес-состояния — Item, InboundOrder, OutboundOrder,
WarehouseTask, Shipment, InventoryLot и twin/SSE домена.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlmodel import Session, select

from app.core.config import settings
from app.core.storage_slot import format_storage_slot_key
from app.events import catalog
from app.models import (
    InboundOrder,
    InventoryLot,
    Item,
    ItemHistory,
    OutboundOrder,
    Shipment,
    User,
    Warehouse,
    WarehouseTask,
)
from app.realtime.item_sse_hub import publish_items_changed
from app.realtime.twin_stream_hub import (
    publish_item_movement,
    publish_occupancy_changed,
    publish_task_update,
    publish_telemetry_fact,
)
from app.services.domain_events import emit_domain_event
from app.services.warehouse_slot_projection import sync_projection_for_item
from app.warehouse_sim import events as ev
from app.warehouse_sim.world import empty_bridge

logger = logging.getLogger(__name__)

SOURCE = "warehouse_sim"
BARCODE_PREFIX = "WDS-"
TASK_TYPE_MAP = {
    "unload": "putaway",
    "putaway": "putaway",
    "pick": "pick",
    "load": "move",
    "replenish": "replenish",
    "charge": "other",
}
TASK_STATUS_MAP = {
    "pending": "pending",
    "assigned": "in_progress",
    "in_progress": "in_progress",
    "done": "completed",
    "blocked": "blocked",
    "failed": "cancelled",
}


def apply_integration_queue(
    session: Session,
    world: dict,
    queue: list[dict] | None = None,
) -> dict[str, int]:
    """Применяет накопленные simulation events к WMS. Возвращает счётчики."""
    if queue is None:
        queue = list(world.get("integration_queue") or [])
        world["integration_queue"] = []
    if not queue:
        return {"applied": 0, "errors": 0}
    ctx = _DomainCtx.from_session(session, world)
    applied = 0
    errors = 0
    touched_items: set[uuid.UUID] = set()
    touched_tasks: set[uuid.UUID] = set()
    orders_changed = False
    occupancy_changed = False
    for rec in queue:
        try:
            result = _apply_one(ctx, rec)
            session.commit()
            applied += 1
            if result.get("item_id"):
                touched_items.add(result["item_id"])
            if result.get("task_id"):
                touched_tasks.add(result["task_id"])
            orders_changed = orders_changed or bool(result.get("orders"))
            occupancy_changed = occupancy_changed or bool(result.get("occupancy"))
        except Exception:
            session.rollback()
            errors += 1
            logger.exception(
                "warehouse_sim integration failed for %s", rec.get("type")
            )
    _publish_integration(
        item_ids=touched_items,
        task_ids=touched_tasks,
        orders=orders_changed,
        occupancy=occupancy_changed,
    )
    return {"applied": applied, "errors": errors}


def seed_world_inventory(session: Session, world: dict) -> int:
    """Создаёт Item для паллет, уже лежащих в ячейках (стартовые остатки симуляции)."""
    bridge = world.setdefault("bridge", empty_bridge())
    if bridge.get("seeded"):
        return 0
    ctx = _DomainCtx.from_session(session, world)
    created = 0
    for pallet in world.get("pallets", {}).values():
        if pallet.get("locationKind") != "cell" or not pallet.get("locationId"):
            continue
        cell = world["cellById"].get(pallet["locationId"])
        sku = next((s for s in world["skus"] if s["id"] == pallet.get("skuId")), None)
        rec = {
            "type": ev.ITEM_STORED,
            "event": {"type": ev.ITEM_STORED, "entityId": pallet["id"]},
            "context": {
                "pallet": dict(pallet),
                "cell": {
                    "id": cell["id"],
                    "rackId": cell["rackId"],
                    "bay": cell["bay"],
                    "level": cell["level"],
                }
                if cell
                else None,
                "sku": dict(sku) if sku else None,
            },
        }
        _ensure_item(ctx, rec["context"], status="warehouse")
        created += 1
    session.commit()
    bridge["seeded"] = True
    if created:
        _publish_integration(item_ids=set(bridge["items"].values()), occupancy=True)
    return created


def reset_demo_domain(session: Session) -> dict[str, int]:
    """Удаляет сущности, созданные симулятором. Атомарно в одной транзакции."""
    counts: dict[str, int] = {}
    session.execute(
        text("DELETE FROM warehouse_task WHERE payload->>'source' = :src"),
        {"src": SOURCE},
    )
    counts["tasks"] = 0
    session.execute(
        text("DELETE FROM inventory_lot WHERE extra->>'source' = :src OR lot_code LIKE :pfx"),
        {"src": SOURCE, "pfx": f"{BARCODE_PREFIX}%"},
    )
    session.execute(
        text("DELETE FROM warehouse_slot_occupancy WHERE item_id IN (SELECT id FROM item WHERE barcode LIKE :pfx)"),
        {"pfx": f"{BARCODE_PREFIX}%"},
    )
    session.execute(
        text("DELETE FROM itemhistory WHERE item_id IN (SELECT id FROM item WHERE barcode LIKE :pfx)"),
        {"pfx": f"{BARCODE_PREFIX}%"},
    )
    items_n = session.execute(
        text("DELETE FROM item WHERE barcode LIKE :pfx"),
        {"pfx": f"{BARCODE_PREFIX}%"},
    )
    counts["items"] = items_n.rowcount if items_n is not None else 0
    inbound_n = session.execute(
        text("DELETE FROM inbound_order WHERE extra->>'source' = :src"),
        {"src": SOURCE},
    )
    outbound_n = session.execute(
        text("DELETE FROM outbound_order WHERE extra->>'source' = :src"),
        {"src": SOURCE},
    )
    shipment_n = session.execute(
        text("DELETE FROM shipment WHERE extra->>'source' = :src"),
        {"src": SOURCE},
    )
    counts["inbound"] = inbound_n.rowcount if inbound_n is not None else 0
    counts["outbound"] = outbound_n.rowcount if outbound_n is not None else 0
    counts["shipments"] = shipment_n.rowcount if shipment_n is not None else 0
    session.commit()
    _publish_integration(occupancy=True, orders=True, items_changed=True)
    return counts


class _DomainCtx:
    def __init__(
        self,
        session: Session,
        world: dict,
        warehouse_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> None:
        self.session = session
        self.world = world
        self.warehouse_id = warehouse_id
        self.actor_id = actor_id
        self.bridge: dict[str, Any] = world.setdefault("bridge", empty_bridge())
        self.run_id: str = str(self.bridge.get("run_id") or uuid.uuid4())
        self.bridge["run_id"] = self.run_id
        self.now = datetime.now(timezone.utc)

    @classmethod
    def from_session(cls, session: Session, world: dict) -> _DomainCtx:
        return cls(
            session,
            world,
            warehouse_id=_ensure_warehouse(session),
            actor_id=_ensure_actor(session),
        )

    def extra(self, **more: Any) -> dict[str, Any]:
        payload = {"source": SOURCE, "demo_run_id": self.run_id}
        payload.update(more)
        return payload


def _apply_one(ctx: _DomainCtx, rec: dict) -> dict[str, Any]:
    handler = _HANDLERS.get(rec.get("type"))
    if handler is None:
        return {}
    return handler(ctx, rec.get("context") or {}) or {}


def _on_truck_arrived(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    truck = c.get("truck") or {}
    truck_id = truck.get("id")
    if not truck_id:
        return {}
    direction = truck.get("direction") or "inbound"
    shipment = _ensure_shipment(
        ctx,
        sim_id=truck_id,
        direction=direction,
        reference=f"WDS-SHP-{truck_id}",
        status="arrived",
        extra_meta={
            "plate": truck.get("plate"),
            "carrier": truck.get("carrier"),
            "sim_truck_id": truck_id,
        },
    )
    ctx.bridge["trucks"][truck_id] = str(shipment.id)
    if direction == "inbound":
        inbound = c.get("inbound") or {}
        order = _ensure_inbound(
            ctx,
            sim_id=inbound.get("id") or truck.get("orderIds", [None])[0],
            code=_wds_code(inbound.get("code") or f"IN-{truck_id}"),
            shipment_id=shipment.id,
            status="open",
            lines=_inbound_lines(c, inbound),
            extra_meta={"sim_truck_id": truck_id, "plate": truck.get("plate")},
        )
        return {"orders": True, "inbound_id": order.id}
    for outbound in c.get("outbound_batch") or []:
        oid = outbound.get("id")
        if not oid:
            continue
        _ensure_outbound(
            ctx,
            sim_id=oid,
            code=_wds_code(outbound.get("code") or f"SO-{oid}"),
            shipment_id=shipment.id,
            status="packed",
            lines=_outbound_lines(outbound),
            extra_meta={"customer": outbound.get("customer"), "sim_truck_id": truck_id},
        )
    shipment.status = "loading"
    shipment.updated_at = ctx.now
    ctx.session.add(shipment)
    return {"orders": True}


def _on_receiving_started(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    inbound = c.get("inbound")
    truck = c.get("truck") or {}
    if inbound:
        order = _ensure_inbound(
            ctx,
            sim_id=inbound["id"],
            code=_wds_code(inbound.get("code") or inbound["id"]),
            status="in_progress",
            lines=_inbound_lines(c, inbound),
            extra_meta={"sim_truck_id": inbound.get("truckId") or truck.get("id")},
        )
        order.status = "in_progress"
        order.updated_at = ctx.now
        ctx.session.add(order)
    ship_id = ctx.bridge["trucks"].get(truck.get("id"))
    if ship_id:
        shipment = ctx.session.get(Shipment, uuid.UUID(ship_id))
        if shipment:
            shipment.status = "arrived"
            shipment.updated_at = ctx.now
            ctx.session.add(shipment)
    return {"orders": True}


def _on_item_received(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    item = _ensure_item(ctx, c, status="incoming")
    inbound = c.get("inbound")
    if inbound:
        order = _ensure_inbound(
            ctx,
            sim_id=inbound["id"],
            code=_wds_code(inbound.get("code") or inbound["id"]),
            status="in_progress",
            lines=_inbound_lines(c, inbound),
        )
        order.status = "in_progress"
        order.updated_at = ctx.now
        ctx.session.add(order)
    _emit_inventory(ctx, catalog.EVENT_INVENTORY_RECEIVED, item, c)
    return {"item_id": item.id, "orders": True, "occupancy": False}


def _on_item_stored(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    item = _ensure_item(ctx, c, status="incoming")
    slot = _slot_from_context(c)
    coords = _free_slot(ctx.session, slot, exclude=item.id)
    _move_item_status(ctx, item, "warehouse", coords)
    inbound = c.get("inbound")
    if inbound and inbound.get("palletsPutaway") is not None and inbound.get("palletsPlanned"):
        order = ctx.session.get(InboundOrder, _uuid(ctx.bridge["inbound"].get(inbound["id"])))
        if order and inbound["palletsPutaway"] >= inbound["palletsPlanned"]:
            order.status = "received"
            order.updated_at = ctx.now
            ctx.session.add(order)
    _emit_inventory(ctx, catalog.EVENT_INVENTORY_PUTAWAY_COMPLETED, item, c, coords)
    return {"item_id": item.id, "occupancy": True, "orders": True}


def _on_item_picked(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    pallet = c.get("pallet") or {}
    if not pallet.get("id"):
        outbound = c.get("outbound") or {}
        pid = (outbound.get("palletIds") or [None])[-1]
        if pid:
            c = {**c, "pallet": {"id": pid, **pallet}}
        else:
            return {"orders": True}
    item = _ensure_item(ctx, c, status="warehouse")
    _clear_item_slot(ctx, item, location="packing")
    outbound = c.get("outbound")
    if outbound:
        order = _ensure_outbound(
            ctx,
            sim_id=outbound["id"],
            code=_wds_code(outbound.get("code") or outbound["id"]),
            status="picking",
            lines=_outbound_lines(outbound),
            extra_meta={"customer": outbound.get("customer")},
        )
        if _outbound_rank(order.status) < _outbound_rank("picking"):
            order.status = "picking"
            order.updated_at = ctx.now
            ctx.session.add(order)
    _emit_inventory(ctx, catalog.EVENT_INVENTORY_PICKED, item, c)
    return {"item_id": item.id, "occupancy": True, "orders": True}


def _on_item_packed(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    outbound = c.get("outbound") or {}
    item_ids = []
    for pid in outbound.get("palletIds") or []:
        item_uuid = _uuid(ctx.bridge["items"].get(pid))
        if not item_uuid:
            continue
        item = ctx.session.get(Item, item_uuid)
        if not item:
            continue
        _move_item_status(ctx, item, "shipment", None)
        item.location = "shipping"
        ctx.session.add(item)
        item_ids.append(item.id)
        _emit_inventory(ctx, catalog.EVENT_INVENTORY_PACKED, item, c)
    if outbound.get("id"):
        order = _ensure_outbound(
            ctx,
            sim_id=outbound["id"],
            code=_wds_code(outbound.get("code") or outbound["id"]),
            status="packed",
            lines=_outbound_lines(outbound),
            extra_meta={"customer": outbound.get("customer")},
        )
        order.status = "packed"
        order.updated_at = ctx.now
        ctx.session.add(order)
    return {
        "item_id": item_ids[0] if item_ids else None,
        "occupancy": True,
        "orders": True,
    }


def _on_item_shipped(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    outbound = c.get("outbound")
    pallet = c.get("pallet")
    item = None
    if pallet:
        item = _ensure_item(ctx, c, status="shipment")
        _move_item_status(ctx, item, "shipped", None)
        item.location = "shipped"
        ctx.session.add(item)
        _emit_inventory(ctx, catalog.EVENT_INVENTORY_SHIPPED, item, c)
    if outbound:
        order = _ensure_outbound(
            ctx,
            sim_id=outbound["id"],
            code=_wds_code(outbound.get("code") or outbound["id"]),
            status="shipped",
            lines=_outbound_lines(outbound),
            extra_meta={"customer": outbound.get("customer")},
        )
        order.status = "shipped"
        order.updated_at = ctx.now
        ctx.session.add(order)
        for pid in outbound.get("palletIds") or []:
            item_uuid = _uuid(ctx.bridge["items"].get(pid))
            if not item_uuid:
                continue
            row = ctx.session.get(Item, item_uuid)
            if row and row.status != "shipped":
                _move_item_status(ctx, row, "shipped", None)
                row.location = "shipped"
                ctx.session.add(row)
    return {"item_id": item.id if item else None, "occupancy": True, "orders": True}


def _on_truck_departed(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    truck = c.get("truck") or {}
    ship_id = ctx.bridge["trucks"].get(truck.get("id"))
    if ship_id:
        shipment = ctx.session.get(Shipment, uuid.UUID(ship_id))
        if shipment:
            shipment.status = "departed" if shipment.direction == "inbound" else "shipped"
            shipment.updated_at = ctx.now
            ctx.session.add(shipment)
    inbound = c.get("inbound")
    if inbound:
        oid = _uuid(ctx.bridge["inbound"].get(inbound["id"]))
        if oid:
            order = ctx.session.get(InboundOrder, oid)
            if order:
                order.status = "received"
                order.updated_at = ctx.now
                ctx.session.add(order)
    for outbound in c.get("outbound_batch") or []:
        oid = _uuid(ctx.bridge["outbound"].get(outbound["id"]))
        if not oid:
            continue
        order = ctx.session.get(OutboundOrder, oid)
        if order:
            order.status = "shipped"
            order.updated_at = ctx.now
            ctx.session.add(order)
    return {"orders": True}


def _on_order_created(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    outbound = c.get("outbound")
    if not outbound:
        return {}
    _ensure_outbound(
        ctx,
        sim_id=outbound["id"],
        code=_wds_code(outbound.get("code") or outbound["id"]),
        status="open",
        lines=_outbound_lines(outbound),
        extra_meta={"customer": outbound.get("customer"), "priority": outbound.get("priority")},
    )
    return {"orders": True}


def _on_order_released(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    outbound = c.get("outbound")
    if not outbound:
        return {}
    order = _ensure_outbound(
        ctx,
        sim_id=outbound["id"],
        code=_wds_code(outbound.get("code") or outbound["id"]),
        status="picking",
        lines=_outbound_lines(outbound),
        extra_meta={"customer": outbound.get("customer")},
    )
    if _outbound_rank(order.status) < _outbound_rank("picking"):
        order.status = "picking"
        order.updated_at = ctx.now
        ctx.session.add(order)
    return {"orders": True}


def _on_task_created(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    task = c.get("task")
    if not task:
        return {}
    row = _ensure_task(ctx, task, c)
    _emit_task(ctx, catalog.EVENT_TASK_CREATED, row)
    return {"task_id": row.id}


def _on_task_assigned(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    task = c.get("task")
    if not task:
        return {}
    row = _ensure_task(ctx, task, c)
    row.status = "in_progress"
    row.updated_at = ctx.now
    payload = dict(row.payload or {})
    payload["device_id"] = (c.get("device") or {}).get("id") or task.get("deviceId")
    payload["sim_status"] = "assigned"
    row.payload = payload
    ctx.session.add(row)
    _emit_task(ctx, catalog.EVENT_TASK_STARTED, row)
    return {"task_id": row.id}


def _on_task_started(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    task = c.get("task")
    if not task:
        return {}
    row = _ensure_task(ctx, task, c)
    row.status = "in_progress"
    row.updated_at = ctx.now
    ctx.session.add(row)
    return {"task_id": row.id}


def _on_task_completed(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    task = c.get("task")
    if not task:
        return {}
    row = _ensure_task(ctx, task, c)
    row.status = "completed"
    row.updated_at = ctx.now
    ctx.session.add(row)
    _emit_task(ctx, catalog.EVENT_TASK_COMPLETED, row)
    return {"task_id": row.id}


def _on_task_blocked(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    task = c.get("task")
    if not task:
        return {}
    row = _ensure_task(ctx, task, c)
    row.status = "blocked"
    row.updated_at = ctx.now
    payload = dict(row.payload or {})
    payload["sim_status"] = "blocked"
    payload["device_id"] = (c.get("device") or {}).get("id")
    row.payload = payload
    ctx.session.add(row)
    _emit_task(ctx, catalog.EVENT_TASK_FAILED, row)
    return {"task_id": row.id}


def _on_device_error(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    task = c.get("task")
    if task:
        return _on_task_blocked(ctx, c)
    return {}


def _on_device_recovered(ctx: _DomainCtx, c: dict) -> dict[str, Any]:
    device = c.get("device") or {}
    device_id = device.get("id")
    if not device_id:
        return {}
    rows = ctx.session.exec(
        select(WarehouseTask).where(WarehouseTask.status == "blocked")
    ).all()
    changed = None
    for row in rows:
        payload = row.payload or {}
        if payload.get("source") != SOURCE:
            continue
        if payload.get("device_id") == device_id:
            row.status = "pending"
            row.updated_at = ctx.now
            payload = dict(payload)
            payload["sim_status"] = "pending"
            row.payload = payload
            ctx.session.add(row)
            changed = row.id
    return {"task_id": changed} if changed else {}


_HANDLERS = {
    ev.TRUCK_ARRIVED: _on_truck_arrived,
    ev.TRUCK_DEPARTED: _on_truck_departed,
    ev.RECEIVING_STARTED: _on_receiving_started,
    ev.ITEM_RECEIVED: _on_item_received,
    ev.ITEM_STORED: _on_item_stored,
    ev.ITEM_PICKED: _on_item_picked,
    ev.ITEM_PACKED: _on_item_packed,
    ev.ITEM_SHIPPED: _on_item_shipped,
    ev.ORDER_CREATED: _on_order_created,
    ev.ORDER_RELEASED: _on_order_released,
    ev.PICKING_STARTED: _on_order_released,
    ev.PICKING_COMPLETED: _on_order_released,
    ev.TASK_CREATED: _on_task_created,
    ev.TASK_ASSIGNED: _on_task_assigned,
    ev.TASK_STARTED: _on_task_started,
    ev.TASK_COMPLETED: _on_task_completed,
    ev.TASK_FAILED: _on_task_blocked,
    ev.TASK_BLOCKED: _on_task_blocked,
    ev.DEVICE_ERROR: _on_device_error,
    ev.DEVICE_RECOVERED: _on_device_recovered,
}


def _ensure_item(ctx: _DomainCtx, c: dict, *, status: str) -> Item:
    pallet = c.get("pallet") or {}
    sim_id = pallet.get("id")
    if not sim_id:
        raise ValueError("pallet id required")
    existing = ctx.bridge["items"].get(sim_id)
    if existing:
        item = ctx.session.get(Item, uuid.UUID(existing))
        if item:
            return item
    sku = c.get("sku") or {}
    barcode = f"{BARCODE_PREFIX}{sim_id}"
    found = ctx.session.exec(select(Item).where(Item.barcode == barcode)).first()
    if found:
        ctx.bridge["items"][sim_id] = str(found.id)
        return found
    title = sku.get("name") or pallet.get("sscc") or sim_id
    if pallet.get("sscc"):
        title = f"{title} · {pallet['sscc']}"
    qty = max(1, int(pallet.get("qty") or sku.get("unitsPerPallet") or 1))
    item = Item(
        title=title[:255],
        description=f"Симуляция склада ({sim_id})"[:255],
        quantity=qty,
        sku=(sku.get("code") or BARCODE_PREFIX + sim_id)[:64],
        barcode=barcode[:64],
        unit="пал",
        location=_location_from_context(c),
        owner_id=ctx.actor_id,
        status="incoming",
    )
    ctx.session.add(item)
    ctx.session.flush()
    emit_domain_event(
        ctx.session,
        event_type=catalog.EVENT_ITEM_CREATED,
        aggregate_type="item",
        aggregate_id=item.id,
        actor_user_id=ctx.actor_id,
        payload={"title": item.title, "status": item.status, "source": SOURCE},
        correlation_id=uuid.UUID(ctx.run_id) if _is_uuid(ctx.run_id) else uuid.uuid4(),
    )
    _history(ctx, item, "status", "", "incoming")
    lot = InventoryLot(
        warehouse_id=ctx.warehouse_id,
        lot_code=f"{BARCODE_PREFIX}{sim_id}"[:128],
        item_id=item.id,
        quantity=qty,
        received_at=ctx.now,
        status="active",
        extra=ctx.extra(sim_pallet_id=sim_id),
    )
    ctx.session.add(lot)
    ctx.bridge["items"][sim_id] = str(item.id)
    if status != "incoming":
        coords = _slot_from_context(c) if status == "warehouse" else None
        _move_item_status(ctx, item, status, coords)
    return item


def _ensure_inbound(
    ctx: _DomainCtx,
    *,
    sim_id: str | None,
    code: str,
    status: str,
    lines: dict[str, Any] | None,
    shipment_id: uuid.UUID | None = None,
    extra_meta: dict[str, Any] | None = None,
) -> InboundOrder:
    if not sim_id:
        sim_id = code
    existing = ctx.bridge["inbound"].get(sim_id)
    if existing:
        row = ctx.session.get(InboundOrder, uuid.UUID(existing))
        if row:
            if shipment_id and row.shipment_id is None:
                row.shipment_id = shipment_id
            if lines:
                row.lines = lines
            ctx.session.add(row)
            return row
    code = code[:64]
    found = ctx.session.exec(
        select(InboundOrder).where(
            InboundOrder.warehouse_id == ctx.warehouse_id,
            InboundOrder.code == code,
        )
    ).first()
    if found:
        ctx.bridge["inbound"][sim_id] = str(found.id)
        return found
    row = InboundOrder(
        warehouse_id=ctx.warehouse_id,
        code=code,
        shipment_id=shipment_id,
        status=status,
        expected_at=ctx.now,
        lines=lines,
        extra=ctx.extra(sim_id=sim_id, **(extra_meta or {})),
    )
    ctx.session.add(row)
    ctx.session.flush()
    ctx.bridge["inbound"][sim_id] = str(row.id)
    return row


def _ensure_outbound(
    ctx: _DomainCtx,
    *,
    sim_id: str,
    code: str,
    status: str,
    lines: dict[str, Any] | None,
    shipment_id: uuid.UUID | None = None,
    extra_meta: dict[str, Any] | None = None,
) -> OutboundOrder:
    existing = ctx.bridge["outbound"].get(sim_id)
    if existing:
        row = ctx.session.get(OutboundOrder, uuid.UUID(existing))
        if row:
            if shipment_id:
                row.shipment_id = shipment_id
            if lines:
                row.lines = lines
            ctx.session.add(row)
            return row
    code = code[:64]
    found = ctx.session.exec(
        select(OutboundOrder).where(
            OutboundOrder.warehouse_id == ctx.warehouse_id,
            OutboundOrder.code == code,
        )
    ).first()
    if found:
        ctx.bridge["outbound"][sim_id] = str(found.id)
        return found
    row = OutboundOrder(
        warehouse_id=ctx.warehouse_id,
        code=code,
        shipment_id=shipment_id,
        status=status,
        ship_by_at=ctx.now,
        lines=lines,
        extra=ctx.extra(sim_id=sim_id, **(extra_meta or {})),
    )
    ctx.session.add(row)
    ctx.session.flush()
    ctx.bridge["outbound"][sim_id] = str(row.id)
    return row


def _ensure_shipment(
    ctx: _DomainCtx,
    *,
    sim_id: str,
    direction: str,
    reference: str,
    status: str,
    extra_meta: dict[str, Any] | None = None,
) -> Shipment:
    existing = ctx.bridge["shipments"].get(sim_id) or ctx.bridge["trucks"].get(sim_id)
    if existing:
        row = ctx.session.get(Shipment, uuid.UUID(existing))
        if row:
            return row
    reference = reference[:128]
    found = ctx.session.exec(
        select(Shipment).where(
            Shipment.warehouse_id == ctx.warehouse_id,
            Shipment.reference == reference,
        )
    ).first()
    if found:
        ctx.bridge["shipments"][sim_id] = str(found.id)
        return found
    row = Shipment(
        warehouse_id=ctx.warehouse_id,
        reference=reference,
        direction=direction if direction in ("inbound", "outbound", "internal") else "inbound",
        status=status,
        scheduled_at=ctx.now,
        extra=ctx.extra(sim_id=sim_id, **(extra_meta or {})),
    )
    ctx.session.add(row)
    ctx.session.flush()
    ctx.bridge["shipments"][sim_id] = str(row.id)
    return row


def _ensure_task(ctx: _DomainCtx, task: dict, c: dict) -> WarehouseTask:
    sim_id = task["id"]
    existing = ctx.bridge["tasks"].get(sim_id)
    if existing:
        row = ctx.session.get(WarehouseTask, uuid.UUID(existing))
        if row:
            return row
    pallet = c.get("pallet") or {}
    item_id = ctx.bridge["items"].get(pallet.get("id") or task.get("palletId"))
    slot = _slot_from_context(c)
    slot_key = format_storage_slot_key(*slot) if slot else None
    payload = ctx.extra(
        sim_task_id=sim_id,
        sim_kind=task.get("kind"),
        device_id=task.get("deviceId") or (c.get("device") or {}).get("id"),
        item_id=item_id,
        slot_key=slot_key,
        storage_row=slot[0] if slot else None,
        storage_level=slot[1] if slot else None,
        storage_cell_x=slot[2] if slot else None,
        storage_cell_z=slot[3] if slot else None,
        from_label=task.get("fromLabel"),
        to_label=task.get("toLabel"),
        sim_order_id=task.get("orderId"),
        sim_truck_id=task.get("truckId"),
    )
    row = WarehouseTask(
        warehouse_id=ctx.warehouse_id,
        task_type=TASK_TYPE_MAP.get(task.get("kind") or "", "other"),
        status=TASK_STATUS_MAP.get(task.get("status") or "pending", "pending"),
        priority=int(task.get("priority") or 0) * 2,
        payload=payload,
        created_at=ctx.now,
        updated_at=ctx.now,
    )
    ctx.session.add(row)
    ctx.session.flush()
    ctx.bridge["tasks"][sim_id] = str(row.id)
    return row


_STATUS_CHAIN = ("incoming", "warehouse", "shipment", "shipped")
_OUTBOUND_RANK = {"open": 0, "picking": 1, "packed": 2, "shipped": 3, "closed": 4}


def _outbound_rank(status: str) -> int:
    return _OUTBOUND_RANK.get(status, 0)


def _move_item_status(
    ctx: _DomainCtx,
    item: Item,
    new_status: str,
    coords: tuple[int, int, int, int] | None,
) -> None:
    if new_status == "warehouse" and coords is None:
        coords = _free_slot(ctx.session, None, exclude=item.id)
    if coords is not None:
        coords = _free_slot(ctx.session, coords, exclude=item.id) or coords
        old = (
            item.storage_row,
            item.storage_level,
            item.storage_cell_x,
            item.storage_cell_z,
        )
        item.storage_row, item.storage_level, item.storage_cell_x, item.storage_cell_z = coords
        item.location = f"{coords[0]}-{coords[1]}-{coords[2]}-{coords[3]}"
        if old != coords:
            _history(ctx, item, "storage_row", str(old[0] or ""), str(coords[0]))
    elif new_status in ("shipment", "shipped"):
        if item.storage_row is not None:
            _history(ctx, item, "storage_row", str(item.storage_row or ""), "")
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
    item.storage_row = None
    item.storage_level = None
    item.storage_cell_x = None
    item.storage_cell_z = None
    item.location = location
    ctx.session.add(item)
    sync_projection_for_item(ctx.session, item)
    ctx.session.flush()


def _slot_from_context(c: dict) -> tuple[int, int, int, int] | None:
    cell = c.get("cell")
    if not cell:
        return None
    rack_id = str(cell.get("rackId") or "rack-1")
    try:
        row = int(rack_id.rsplit("-", 1)[-1])
    except ValueError:
        row = 1
    row = max(1, min(12, row))
    level = max(1, min(4, int(cell.get("level") or 1)))
    x = max(1, min(20, int(cell.get("bay") or 1)))
    return row, level, x, 1


def _free_slot(
    session: Session,
    preferred: tuple[int, int, int, int] | None,
    *,
    exclude: uuid.UUID | None,
) -> tuple[int, int, int, int] | None:
    occupied: set[tuple[int, int, int, int]] = set()
    stmt = select(
        Item.storage_row,
        Item.storage_level,
        Item.storage_cell_x,
        Item.storage_cell_z,
        Item.id,
    ).where(
        Item.storage_row.is_not(None),
        Item.storage_level.is_not(None),
        Item.storage_cell_x.is_not(None),
        Item.storage_cell_z.is_not(None),
    )
    for row, level, x, z, item_id in session.exec(stmt).all():
        if exclude is not None and item_id == exclude:
            continue
        occupied.add((int(row), int(level), int(x), int(z)))
    if preferred and preferred not in occupied:
        return preferred
    for row in range(1, 13):
        for level in range(1, 5):
            for x in range(1, 21):
                cand = (row, level, x, 1)
                if cand not in occupied:
                    return cand
    return preferred


def _location_from_context(c: dict) -> str | None:
    cell = c.get("cell")
    if cell:
        return str(cell.get("id"))
    pallet = c.get("pallet") or {}
    return pallet.get("locationId")


def _inbound_lines(c: dict, inbound: dict) -> dict[str, Any]:
    sku = c.get("sku") or {}
    return {
        "items": [
            {
                "sku": sku.get("code") or inbound.get("skuId"),
                "name": sku.get("name"),
                "pallets": inbound.get("palletsPlanned"),
                "received": inbound.get("palletsReceived"),
            }
        ]
    }


def _outbound_lines(outbound: dict) -> dict[str, Any]:
    return {
        "items": [
            {
                "skuId": line.get("skuId"),
                "pallets": line.get("pallets"),
                "picked": line.get("picked"),
            }
            for line in outbound.get("lines") or []
        ],
        "customer": outbound.get("customer"),
        "priority": outbound.get("priority"),
    }


def _history(ctx: _DomainCtx, item: Item, field: str, old: str, new: str) -> None:
    ctx.session.add(
        ItemHistory(
            item_id=item.id,
            user_id=ctx.actor_id,
            field_name=field[:64],
            old_value=(old or "")[:512],
            new_value=(new or "")[:512],
        )
    )


def _emit_inventory(
    ctx: _DomainCtx,
    event_type: str,
    item: Item,
    c: dict,
    coords: tuple[int, int, int, int] | None = None,
) -> None:
    slot = coords or _slot_from_context(c)
    emit_domain_event(
        ctx.session,
        event_type=event_type,
        aggregate_type="item",
        aggregate_id=item.id,
        actor_user_id=ctx.actor_id,
        payload={
            "schema_version": 1,
            "warehouse_id": str(ctx.warehouse_id),
            "item_id": str(item.id),
            "quantity": item.quantity,
            "slot_key": format_storage_slot_key(*slot) if slot else None,
            "reference": (c.get("pallet") or {}).get("sscc"),
            "meta": {"source": SOURCE, "demo_run_id": ctx.run_id},
        },
        strict_payload=False,
    )


def _emit_task(ctx: _DomainCtx, event_type: str, task: WarehouseTask) -> None:
    emit_domain_event(
        ctx.session,
        event_type=event_type,
        aggregate_type="warehouse_task",
        aggregate_id=task.id,
        actor_user_id=ctx.actor_id,
        payload={
            "schema_version": 1,
            "task_id": str(task.id),
            "warehouse_task_id": str(task.id),
            "warehouse_id": str(task.warehouse_id),
            "status": task.status,
            "meta": {"source": SOURCE},
        },
        strict_payload=False,
    )
    publish_task_update(
        task_id=task.id,
        event_type=event_type,
        payload={"status": task.status, "task_type": task.task_type, "source": SOURCE},
    )


def _publish_integration(
    *,
    item_ids: set[uuid.UUID] | None = None,
    task_ids: set[uuid.UUID] | None = None,
    orders: bool = False,
    occupancy: bool = False,
    items_changed: bool = False,
) -> None:
    if item_ids or items_changed:
        publish_items_changed()
        if item_ids:
            for iid in list(item_ids)[:12]:
                publish_item_movement(item_id=iid, reason="warehouse_sim")
        else:
            publish_item_movement(reason="warehouse_sim")
    if occupancy:
        publish_occupancy_changed()
    if orders or task_ids:
        publish_telemetry_fact(
            event_type="wms.demo_sync",
            payload={"source": SOURCE, "orders": orders, "tasks": bool(task_ids)},
        )


def _ensure_warehouse(session: Session) -> uuid.UUID:
    wh = session.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if wh:
        return wh.id
    wh = session.exec(select(Warehouse).order_by(Warehouse.created_at)).first()
    if wh:
        return wh.id
    wh = Warehouse(code="default", name="Основной склад")
    session.add(wh)
    session.commit()
    session.refresh(wh)
    return wh.id


def _ensure_actor(session: Session) -> uuid.UUID:
    user = session.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
    if user:
        return user.id
    user = session.exec(select(User).where(User.is_superuser == True)).first()  # noqa: E712
    if user:
        return user.id
    user = session.exec(select(User)).first()
    if not user:
        raise RuntimeError("Нет пользователя для симуляции склада")
    return user.id


def _wds_code(code: str) -> str:
    text = (code or "X")[:60]
    if text.startswith("WDS-"):
        return text[:64]
    return f"WDS-{text}"[:64]


def _uuid(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False
