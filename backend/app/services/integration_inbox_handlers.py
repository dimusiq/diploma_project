"""Обработчики integration_inbox → мутация домена + emit_domain_event (strict v1)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session

from app.core.storage_slot import parse_storage_slot_key
from app.events import catalog
from app.events.registry import normalize_event_payload
from app.models import (
    Equipment,
    IntegrationInbox,
    Item,
    SensorReading,
    VehiclePosition,
    WarehouseTask,
)
from app.services.domain_events import emit_domain_event
from app.services.warehouse_slot_projection import sync_projection_for_item

_ALLOWED_ITEM_STATUS = {
    "incoming": ["warehouse"],
    "warehouse": ["shipment"],
    "shipment": ["shipped"],
}


def _try_item_status(item: Item, new_status: str) -> None:
    allowed = _ALLOWED_ITEM_STATUS.get(item.status, [])
    if new_status in allowed:
        item.status = new_status


def _correlation_uuid(payload: dict[str, Any]) -> uuid.UUID | None:
    raw = payload.get("correlation_id")
    if raw is None:
        return None
    try:
        return uuid.UUID(str(raw))
    except (ValueError, TypeError):
        return None


def _occurred_at(payload: dict[str, Any]) -> datetime | None:
    raw = payload.get("occurred_at")
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    if isinstance(raw, str):
        try:
            s = raw.replace("Z", "+00:00")
            return datetime.fromisoformat(s)
        except ValueError:
            return None
    return None


def _inventory_side_effects(
    event_type: str,
    item: Item,
    inv: dict[str, Any],
) -> None:
    meta = inv.get("meta") if isinstance(inv.get("meta"), dict) else {}
    slot_key = inv.get("slot_key")
    if event_type in (
        catalog.EVENT_INVENTORY_PUTAWAY_COMPLETED,
        catalog.EVENT_INVENTORY_MOVED,
    ):
        if slot_key and isinstance(slot_key, str):
            coords = parse_storage_slot_key(slot_key)
            if coords:
                r, lev, x, z = coords
                item.storage_row = r
                item.storage_level = lev
                item.storage_cell_x = x
                item.storage_cell_z = z
        target = meta.get("item_status")
        if target == "warehouse":
            _try_item_status(item, "warehouse")
    elif event_type == catalog.EVENT_INVENTORY_PICKED:
        item.storage_row = None
        item.storage_level = None
        item.storage_cell_x = None
        item.storage_cell_z = None
        if meta.get("item_status") == "shipment":
            _try_item_status(item, "shipment")
    elif event_type == catalog.EVENT_INVENTORY_SHIPPED:
        _try_item_status(item, "shipped")
    elif event_type == catalog.EVENT_INVENTORY_RECEIVED:
        adv = meta.get("advance_status")
        if adv == "warehouse":
            _try_item_status(item, "warehouse")


def _opt_uuid(val: Any) -> uuid.UUID | None:
    if val is None:
        return None
    return uuid.UUID(str(val))


def handle_inventory_typed(session: Session, row: IntegrationInbox, event_type: str) -> Any:
    raw = dict(row.payload or {})
    raw.setdefault("schema_version", 1)
    inv = normalize_event_payload(event_type, 1, raw, strict_typed_events=True)
    item_id = inv.get("item_id")
    item = session.get(Item, uuid.UUID(str(item_id))) if item_id else None
    if item is not None:
        _inventory_side_effects(event_type, item, inv)
        sync_projection_for_item(session, item)

    if item_id:
        agg_type = "item"
        agg_id = uuid.UUID(str(item_id))
    elif inv.get("warehouse_id"):
        agg_type = "warehouse"
        agg_id = uuid.UUID(str(inv["warehouse_id"]))
    else:
        agg_type = "integration"
        agg_id = row.id

    return emit_domain_event(
        session,
        event_type=event_type,
        aggregate_type=agg_type,
        aggregate_id=agg_id,
        payload=inv,
        actor_user_id=None,
        correlation_id=_correlation_uuid(raw),
        occurred_at=_occurred_at(raw),
        strict_payload=True,
    )


def handle_slot_event(session: Session, row: IntegrationInbox, event_type: str) -> Any:
    raw = dict(row.payload or {})
    raw.setdefault("schema_version", 1)
    p = normalize_event_payload(event_type, 1, raw, strict_typed_events=True)
    slot_key = p["slot_key"]
    agg_id = uuid.uuid5(uuid.NAMESPACE_URL, f"slot:{slot_key}")
    wid = p.get("warehouse_id")
    agg_type = "slot"
    if wid:
        agg_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"{wid}:{slot_key}")
    return emit_domain_event(
        session,
        event_type=event_type,
        aggregate_type=agg_type,
        aggregate_id=agg_id,
        payload=p,
        actor_user_id=None,
        correlation_id=_correlation_uuid(raw),
        occurred_at=_occurred_at(raw),
        strict_payload=True,
    )


def handle_equipment_position(session: Session, row: IntegrationInbox) -> Any:
    raw = dict(row.payload or {})
    raw.setdefault("schema_version", 1)
    p = normalize_event_payload(
        catalog.EVENT_EQUIPMENT_POSITION_UPDATED,
        1,
        raw,
        strict_typed_events=True,
    )
    eq_id = p.get("equipment_id")
    if eq_id:
        eq_uuid = uuid.UUID(str(eq_id))
        if session.get(Equipment, eq_uuid) is not None:
            src = p.get("source") or row.source
            if isinstance(src, str) and len(src) > 64:
                src = src[:64]
            vp = VehiclePosition(
                warehouse_id=p.get("warehouse_id"),
                equipment_id=eq_uuid,
                recorded_at=datetime.now(timezone.utc),
                pose=dict(p.get("pose") or {}),
                source=src if isinstance(src, str) else None,
                extra={"integration_inbox_id": str(row.id)},
            )
            session.add(vp)
    agg_id = uuid.UUID(str(eq_id)) if eq_id else row.id
    return emit_domain_event(
        session,
        event_type=catalog.EVENT_EQUIPMENT_POSITION_UPDATED,
        aggregate_type="equipment",
        aggregate_id=agg_id,
        payload=p,
        actor_user_id=None,
        correlation_id=_correlation_uuid(raw),
        occurred_at=_occurred_at(raw),
        strict_payload=True,
    )


def handle_equipment_battery(session: Session, row: IntegrationInbox) -> Any:
    raw = dict(row.payload or {})
    raw.setdefault("schema_version", 1)
    p = normalize_event_payload(
        catalog.EVENT_EQUIPMENT_BATTERY_UPDATED,
        1,
        raw,
        strict_typed_events=True,
    )
    eq_uuid = uuid.UUID(str(p["equipment_id"]))
    wid = p.get("warehouse_id")
    pct = p.get("percent")
    session.add(
        SensorReading(
            warehouse_id=wid,
            sensor_code=f"eq-{eq_uuid}",
            metric_key="battery_percent",
            read_at=datetime.now(timezone.utc),
            value_float=float(pct) if pct is not None else None,
            value_text=None,
            position=None,
            raw={"voltage_v": p.get("voltage_v")},
        )
    )
    return emit_domain_event(
        session,
        event_type=catalog.EVENT_EQUIPMENT_BATTERY_UPDATED,
        aggregate_type="equipment",
        aggregate_id=eq_uuid,
        payload=p,
        actor_user_id=None,
        correlation_id=_correlation_uuid(raw),
        occurred_at=_occurred_at(raw),
        strict_payload=True,
    )


def handle_task_lifecycle(session: Session, row: IntegrationInbox, event_type: str) -> Any:
    raw = dict(row.payload or {})
    raw.setdefault("schema_version", 1)
    t = normalize_event_payload(event_type, 1, raw, strict_typed_events=True)
    tid = uuid.UUID(str(t["task_id"]))
    task = session.get(WarehouseTask, tid)
    if task is None and event_type == catalog.EVENT_TASK_CREATED:
        wid = t.get("warehouse_id")
        meta = t.get("meta") if isinstance(t.get("meta"), dict) else {}
        if wid is None:
            wid = meta.get("warehouse_id")
        if wid is None:
            raise ValueError("task.created: нужен warehouse_id в payload или meta")
        tt = str(meta.get("task_type", "other"))[:32]
        task = WarehouseTask(
            id=tid,
            warehouse_id=uuid.UUID(str(wid)),
            task_type=tt,
            status=(t.get("status") or "pending")[:32],
            priority=int(meta.get("priority", 0)),
            assigned_user_id=_opt_uuid(meta.get("assigned_user_id")),
            handling_unit_id=_opt_uuid(meta.get("handling_unit_id")),
            storage_bin_id=_opt_uuid(meta.get("storage_bin_id")),
            payload=meta.get("task_payload")
            if isinstance(meta.get("task_payload"), dict)
            else None,
        )
        session.add(task)
        session.flush()
    elif task is not None and t.get("status"):
        task.status = str(t["status"])[:32]
        task.updated_at = datetime.now(timezone.utc)
    elif task is None:
        raise ValueError("warehouse_task не найден и событие не task.created")

    return emit_domain_event(
        session,
        event_type=event_type,
        aggregate_type="warehouse_task",
        aggregate_id=tid,
        payload=t,
        actor_user_id=None,
        correlation_id=_correlation_uuid(raw),
        occurred_at=_occurred_at(raw),
        strict_payload=True,
    )


def handle_queue_depth(session: Session, row: IntegrationInbox) -> Any:
    raw = dict(row.payload or {})
    raw.setdefault("schema_version", 1)
    q = normalize_event_payload(
        catalog.EVENT_QUEUE_DEPTH_UPDATED,
        1,
        raw,
        strict_typed_events=True,
    )
    wid = uuid.UUID(str(q["warehouse_id"]))
    return emit_domain_event(
        session,
        event_type=catalog.EVENT_QUEUE_DEPTH_UPDATED,
        aggregate_type="queue",
        aggregate_id=wid,
        payload=q,
        actor_user_id=None,
        correlation_id=_correlation_uuid(raw),
        occurred_at=_occurred_at(raw),
        strict_payload=True,
    )


def handle_alert(session: Session, row: IntegrationInbox, event_type: str) -> Any:
    raw = dict(row.payload or {})
    raw.setdefault("schema_version", 1)
    p = normalize_event_payload(event_type, 1, raw, strict_typed_events=True)
    out = dict(p)
    if out.get("alert_id") is None:
        agg_id = uuid.uuid4()
        out["alert_id"] = str(agg_id)
    else:
        agg_id = uuid.UUID(str(out["alert_id"]))
    return emit_domain_event(
        session,
        event_type=event_type,
        aggregate_type="alert",
        aggregate_id=agg_id,
        payload=out,
        actor_user_id=None,
        correlation_id=_correlation_uuid(raw),
        occurred_at=_occurred_at(raw),
        strict_payload=True,
    )


INVENTORY_EVENT_TYPES = frozenset(
    {
        catalog.EVENT_INVENTORY_RECEIVED,
        catalog.EVENT_INVENTORY_PUTAWAY_PLANNED,
        catalog.EVENT_INVENTORY_PUTAWAY_COMPLETED,
        catalog.EVENT_INVENTORY_MOVED,
        catalog.EVENT_INVENTORY_PICKED,
        catalog.EVENT_INVENTORY_PACKED,
        catalog.EVENT_INVENTORY_SHIPPED,
        catalog.EVENT_INVENTORY_COUNTED,
        catalog.EVENT_INVENTORY_ADJUSTED,
    }
)

SLOT_EVENT_TYPES = frozenset(
    {
        catalog.EVENT_SLOT_BLOCKED,
        catalog.EVENT_SLOT_UNBLOCKED,
    }
)

TASK_EVENT_TYPES = frozenset(
    {
        catalog.EVENT_TASK_CREATED,
        catalog.EVENT_TASK_STARTED,
        catalog.EVENT_TASK_PAUSED,
        catalog.EVENT_TASK_COMPLETED,
        catalog.EVENT_TASK_FAILED,
    }
)
