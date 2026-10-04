"""Обработчики simulation events → мутации WMS."""

from __future__ import annotations

import uuid
from typing import Any

from sqlmodel import select

from app.events import catalog
from app.models import InboundOrder, Item, OutboundOrder, Shipment, WarehouseTask
from app.warehouse_sim import events as ev
from app.warehouse_sim.integration_context import (
    _DomainCtx,
    _emit_inventory,
    _emit_task,
    _ensure_inbound,
    _ensure_item,
    _ensure_outbound,
    _ensure_shipment,
    _ensure_task,
    _inbound_lines,
    _outbound_lines,
    _outbound_rank,
    _uuid,
    _wds_code,
)
from app.warehouse_sim.integration_schemas import SOURCE
from app.warehouse_sim.integration_slots import (
    _clear_item_slot,
    _free_slot,
    _move_item_status,
    _slot_from_context,
)


def _apply_one(ctx: _DomainCtx, rec: dict[str, Any]) -> dict[str, Any]:
    event_type = rec.get("type")
    handler = _HANDLERS.get(event_type) if isinstance(event_type, str) else None
    if handler is None:
        return {}
    context = rec.get("context") or {}
    if not isinstance(context, dict):
        return {}
    return handler(ctx, context) or {}


def _on_truck_arrived(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
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


def _on_receiving_started(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
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


def _on_item_received(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
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


def _on_item_stored(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
    item = _ensure_item(ctx, c, status="incoming")
    slot = _slot_from_context(c)
    coords = _free_slot(ctx, slot, exclude=item.id)
    _move_item_status(ctx, item, "warehouse", coords)
    inbound = c.get("inbound")
    if (
        inbound
        and inbound.get("palletsPutaway") is not None
        and inbound.get("palletsPlanned")
    ):
        order = ctx.session.get(
            InboundOrder, _uuid(ctx.bridge["inbound"].get(inbound["id"]))
        )
        if order and inbound["palletsPutaway"] >= inbound["palletsPlanned"]:
            order.status = "received"
            order.updated_at = ctx.now
            ctx.session.add(order)
    _emit_inventory(ctx, catalog.EVENT_INVENTORY_PUTAWAY_COMPLETED, item, c, coords)
    return {"item_id": item.id, "occupancy": True, "orders": True}


def _on_item_picked(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
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


def _on_item_packed(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
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


def _on_item_shipped(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
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


def _on_truck_departed(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
    truck = c.get("truck") or {}
    ship_id = ctx.bridge["trucks"].get(truck.get("id"))
    if ship_id:
        shipment = ctx.session.get(Shipment, uuid.UUID(ship_id))
        if shipment:
            shipment.status = (
                "departed" if shipment.direction == "inbound" else "shipped"
            )
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
        outbound_order = ctx.session.get(OutboundOrder, oid)
        if outbound_order:
            outbound_order.status = "shipped"
            outbound_order.updated_at = ctx.now
            ctx.session.add(outbound_order)
    return {"orders": True}


def _on_order_created(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
    outbound = c.get("outbound")
    if not outbound:
        return {}
    _ensure_outbound(
        ctx,
        sim_id=outbound["id"],
        code=_wds_code(outbound.get("code") or outbound["id"]),
        status="open",
        lines=_outbound_lines(outbound),
        extra_meta={
            "customer": outbound.get("customer"),
            "priority": outbound.get("priority"),
        },
    )
    return {"orders": True}


def _on_order_released(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
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


def _on_task_created(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
    task = c.get("task")
    if not task:
        return {}
    row = _ensure_task(ctx, task, c)
    _emit_task(ctx, catalog.EVENT_TASK_CREATED, row)
    return {"task_id": row.id}


def _on_task_assigned(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
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


def _on_task_started(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
    task = c.get("task")
    if not task:
        return {}
    row = _ensure_task(ctx, task, c)
    row.status = "in_progress"
    row.updated_at = ctx.now
    ctx.session.add(row)
    return {"task_id": row.id}


def _on_task_completed(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
    task = c.get("task")
    if not task:
        return {}
    row = _ensure_task(ctx, task, c)
    row.status = "completed"
    row.updated_at = ctx.now
    ctx.session.add(row)
    _emit_task(ctx, catalog.EVENT_TASK_COMPLETED, row)
    return {"task_id": row.id}


def _on_task_blocked(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
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


def _on_device_error(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
    task = c.get("task")
    if task:
        return _on_task_blocked(ctx, c)
    return {}


def _on_device_recovered(ctx: _DomainCtx, c: dict[str, Any]) -> dict[str, Any]:
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
