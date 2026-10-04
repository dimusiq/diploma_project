"""Контекст интеграции и ensure-* сущности WMS."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

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
from app.realtime.twin_stream_hub import publish_task_update
from app.services.domain_events import emit_domain_event
from app.warehouse_sim.integration_schemas import (
    _OUTBOUND_RANK,
    BARCODE_PREFIX,
    SOURCE,
    TASK_STATUS_MAP,
    TASK_TYPE_MAP,
)
from app.warehouse_sim.world import empty_bridge

# Кэш констант процесса (warehouse/actor не меняются между flush).
_CACHED_WAREHOUSE_ID: uuid.UUID | None = None
_CACHED_ACTOR_ID: uuid.UUID | None = None

logger = logging.getLogger(__name__)

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
        # Кэш занятых слотов на батч (инвалидируется при назначении/освобождении).
        self._occupied_slots: set[tuple[int, int, int, int]] | None = None
        self._slot_queries: int = 0

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

    def occupied_slots(self) -> set[tuple[int, int, int, int]]:
        if self._occupied_slots is None:
            self._slot_queries += 1
            occupied: set[tuple[int, int, int, int]] = set()
            stmt = select(
                Item.storage_row,
                Item.storage_level,
                Item.storage_cell_x,
                Item.storage_cell_z,
            ).where(
                Item.storage_row.is_not(None),
                Item.storage_level.is_not(None),
                Item.storage_cell_x.is_not(None),
                Item.storage_cell_z.is_not(None),
            )
            for row, level, x, z in self.session.exec(stmt).all():
                occupied.add((int(row), int(level), int(x), int(z)))
            self._occupied_slots = occupied
        return self._occupied_slots

    def mark_slot_taken(self, coords: tuple[int, int, int, int]) -> None:
        self.occupied_slots().add(coords)

    def mark_slot_freed(self, coords: tuple[int, int, int, int]) -> None:
        if self._occupied_slots is not None:
            self._occupied_slots.discard(coords)


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
        # Lazy: integration_slots ↔ context (циклический импорт).
        from app.warehouse_sim.integration_slots import (
            _move_item_status,
            _slot_from_context,
        )

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
        direction=direction
        if direction in ("inbound", "outbound", "internal")
        else "inbound",
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
    from app.warehouse_sim.integration_slots import _slot_from_context

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


def _outbound_rank(status: str) -> int:
    return _OUTBOUND_RANK.get(status, 0)


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
    from app.warehouse_sim.integration_slots import _slot_from_context

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


def _ensure_warehouse(session: Session) -> uuid.UUID:
    global _CACHED_WAREHOUSE_ID
    if _CACHED_WAREHOUSE_ID is not None:
        return _CACHED_WAREHOUSE_ID
    wh = session.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if wh:
        _CACHED_WAREHOUSE_ID = wh.id
        return wh.id
    wh = session.exec(select(Warehouse).order_by(Warehouse.created_at)).first()
    if wh:
        _CACHED_WAREHOUSE_ID = wh.id
        return wh.id
    wh = Warehouse(code="default", name="Основной склад")
    session.add(wh)
    session.commit()
    session.refresh(wh)
    _CACHED_WAREHOUSE_ID = wh.id
    return wh.id


def _ensure_actor(session: Session) -> uuid.UUID:
    global _CACHED_ACTOR_ID
    if _CACHED_ACTOR_ID is not None:
        return _CACHED_ACTOR_ID
    user = session.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    if user:
        _CACHED_ACTOR_ID = user.id
        return user.id
    user = session.exec(select(User).where(User.is_superuser == True)).first()  # noqa: E712
    if user:
        _CACHED_ACTOR_ID = user.id
        return user.id
    user = session.exec(select(User)).first()
    if not user:
        raise RuntimeError("Нет пользователя для симуляции склада")
    _CACHED_ACTOR_ID = user.id
    return user.id


def clear_process_caches() -> None:
    """Сброс кэшей процесса (тесты / смена БД)."""
    global _CACHED_WAREHOUSE_ID, _CACHED_ACTOR_ID
    _CACHED_WAREHOUSE_ID = None
    _CACHED_ACTOR_ID = None


def _location_from_context(c: dict) -> str | None:
    # Lazy: integration_slots ↔ context (циклический импорт).
    from app.warehouse_sim.integration_slots import (
        _location_from_context as _location_impl,
    )

    return _location_impl(c)


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
