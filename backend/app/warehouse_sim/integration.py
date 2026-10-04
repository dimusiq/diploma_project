"""
Интеграционный слой: Simulation Event → существующие WMS-сервисы/модели.

Simulation Engine остаётся источником движения техники.
Единственный источник бизнес-состояния — Item, InboundOrder, OutboundOrder,
WarehouseTask, Shipment, InventoryLot и twin/SSE домена.

Реализация: integration_schemas / integration_context /
integration_handlers / integration_slots.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, cast

from sqlalchemy import text
from sqlmodel import Session

from app.realtime.item_sse_hub import publish_items_changed
from app.realtime.twin_stream_hub import (
    publish_item_movement,
    publish_occupancy_changed,
    publish_telemetry_fact,
)
from app.warehouse_sim import events as ev
from app.warehouse_sim.integration_context import (
    _DomainCtx,
    _ensure_item,
    clear_process_caches,
)
from app.warehouse_sim.integration_handlers import _apply_one
from app.warehouse_sim.integration_schemas import (
    _SIM_STORAGE_BAYS,
    _SIM_STORAGE_LEVELS,
    _SIM_STORAGE_ROWS,
    BARCODE_PREFIX,
    SOURCE,
    TASK_STATUS_MAP,
    TASK_TYPE_MAP,
)
from app.warehouse_sim.integration_slots import _free_slot, _slot_from_context
from app.warehouse_sim.world import empty_bridge

logger = logging.getLogger(__name__)

__all__ = [
    "BARCODE_PREFIX",
    "SOURCE",
    "TASK_STATUS_MAP",
    "TASK_TYPE_MAP",
    "_DomainCtx",
    "_SIM_STORAGE_BAYS",
    "_SIM_STORAGE_LEVELS",
    "_SIM_STORAGE_ROWS",
    "_apply_one",
    "_free_slot",
    "_publish_integration",
    "_slot_from_context",
    "apply_integration_queue",
    "clear_process_caches",
    "reset_demo_domain",
    "seed_world_inventory",
]


def apply_integration_queue(
    session: Session,
    world: dict[str, Any],
    queue: list[dict[str, Any]] | None = None,
) -> dict[str, int]:
    """
    Применяет накопленные simulation events к WMS одним батчем (один commit).

    Если ``queue is None`` — дренирует ``world["integration_queue"]`` и при ошибке
    возвращает батч обратно. Если очередь передана явно — world не дренируется
    и при ошибке не дублируется (caller/outbox владеет жизненным циклом).
    """
    drained_from_world = False
    if queue is None:
        queue = list(world.get("integration_queue") or [])
        world["integration_queue"] = []
        drained_from_world = True
    if not queue:
        return {"applied": 0, "errors": 0, "requeued": 0, "commits": 0}
    ctx = _DomainCtx.from_session(session, world)
    touched_items: set[uuid.UUID] = set()
    touched_tasks: set[uuid.UUID] = set()
    orders_changed = False
    occupancy_changed = False
    try:
        for rec in queue:
            result = _apply_one(ctx, rec) or {}
            if result.get("item_id"):
                touched_items.add(result["item_id"])
            if result.get("task_id"):
                touched_tasks.add(result["task_id"])
            orders_changed = orders_changed or bool(result.get("orders"))
            occupancy_changed = occupancy_changed or bool(result.get("occupancy"))
        session.commit()
    except Exception:
        session.rollback()
        if drained_from_world:
            pending = list(world.get("integration_queue") or [])
            world["integration_queue"] = list(queue) + pending
        logger.exception(
            "warehouse_sim integration batch failed (%s events), requeued=%s",
            len(queue),
            drained_from_world,
        )
        return {
            "applied": 0,
            "errors": 1,
            "requeued": len(queue) if drained_from_world else 0,
            "commits": 0,
        }
    _publish_integration(
        item_ids=touched_items,
        task_ids=touched_tasks,
        orders=orders_changed,
        occupancy=occupancy_changed,
    )
    return {
        "applied": len(queue),
        "errors": 0,
        "requeued": 0,
        "commits": 1,
    }


def seed_world_inventory(session: Session, world: dict[str, Any]) -> int:
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
        _ensure_item(ctx, cast(dict[str, Any], rec["context"]), status="warehouse")
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
        text(
            "DELETE FROM inventory_lot WHERE extra->>'source' = :src OR lot_code LIKE :pfx"
        ),
        {"src": SOURCE, "pfx": f"{BARCODE_PREFIX}%"},
    )
    session.execute(
        text(
            "DELETE FROM warehouse_slot_occupancy WHERE item_id IN (SELECT id FROM item WHERE barcode LIKE :pfx)"
        ),
        {"pfx": f"{BARCODE_PREFIX}%"},
    )
    session.execute(
        text(
            "DELETE FROM itemhistory WHERE item_id IN (SELECT id FROM item WHERE barcode LIKE :pfx)"
        ),
        {"pfx": f"{BARCODE_PREFIX}%"},
    )
    items_n = session.execute(
        text("DELETE FROM item WHERE barcode LIKE :pfx"),
        {"pfx": f"{BARCODE_PREFIX}%"},
    )
    counts["items"] = int(getattr(items_n, "rowcount", 0) or 0)
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
    session.execute(text("DELETE FROM wsim_event"))
    session.execute(text("DELETE FROM wsim_integration_outbox"))
    counts["inbound"] = int(getattr(inbound_n, "rowcount", 0) or 0)
    counts["outbound"] = int(getattr(outbound_n, "rowcount", 0) or 0)
    counts["shipments"] = int(getattr(shipment_n, "rowcount", 0) or 0)
    session.commit()
    _publish_integration(occupancy=True, orders=True, items_changed=True)
    return counts


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
