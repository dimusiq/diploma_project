"""Реализации инструментов агента: только ORM/SQLModel, без raw SQL из LLM."""

from __future__ import annotations

import json
import uuid
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_
from sqlmodel import Session, col, func, select

from app.agent.tool_safety import AgentToolContext, ToolSafetyClass
from app.core.permissions import can_read_audit, can_see_all_items
from app.models import (
    AgentKnowledgeChunk,
    DomainEvent,
    Equipment,
    Item,
    Notification,
    User,
    Warehouse,
    WarehouseLayout,
    WarehouseRack,
    WarehouseSlotOccupancy,
    WarehouseTask,
    WarehouseZone,
)
from app.schemas.warehouse_topology import (
    default_topology_from_layout_spec,
    parse_topology_from_spec,
)
from app.simulation.des_engine import SimulationConfig, run_discrete_event_simulation


def _json(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)


def _default_warehouse_id(session: Session) -> uuid.UUID | None:
    w = session.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if w:
        return w.id
    any_w = session.exec(select(Warehouse).limit(1)).first()
    return any_w.id if any_w else None


def _item_scope(session: Session, user: User):
    stmt = select(Item)
    if not can_see_all_items(session, user):
        stmt = stmt.where(Item.owner_id == user.id)
    return stmt


def _act_gate(
    ctx: AgentToolContext | None,
    *,
    tool_name: str,
    payload: dict[str, Any],
    superuser_only: bool = False,
) -> str | None:
    """Возвращает JSON-ответ, если выполнять act нельзя; иначе None."""
    if ctx is None:
        return _json(
            {
                "error": "internal_error",
                "detail": "Отсутствует контекст выполнения инструментов",
            }
        )
    if superuser_only and not ctx.is_superuser:
        return _json(
            {
                "requires_confirmation": True,
                "superuser_only": True,
                "tool": tool_name,
                "message": "Инструмент доступен только суперпользователю",
            }
        )
    if ctx.sandbox:
        return _json(
            {
                "sandbox": True,
                "tool": tool_name,
                "safety": ToolSafetyClass.ACT.value,
                "payload": payload,
                "message": "Режим sandbox: запись в БД не выполнялась",
            }
        )
    if not ctx.can_execute_act():
        return _json(
            {
                "requires_confirmation": True,
                "tool": tool_name,
                "safety": ToolSafetyClass.ACT.value,
                "payload": payload,
                "message": (
                    "Действие не выполнено. Нужно явное подтверждение в UI: "
                    "запрос с allow_mutating_tools=true (только суперпользователь, sandbox выключен)."
                ),
                "compensation_hint": "Повторный вызов с подтверждением или отмена в интерфейсе склада",
            }
        )
    return None


# --- read handlers ---


def handle_search_items_in_warehouse(session: Session, user: User, args: dict[str, Any], _ctx: Any) -> str:
    sku = str(args.get("sku_fragment") or "").strip()
    title = str(args.get("title_fragment") or "").strip()
    try:
        limit = int(args.get("limit") or 15)
    except (TypeError, ValueError):
        limit = 15
    limit = max(1, min(limit, 50))
    if not sku and not title:
        return _json({"error": "Укажите sku_fragment и/или title_fragment"})
    stmt = _item_scope(session, user)
    if sku:
        stmt = stmt.where(col(Item.sku).is_not(None)).where(col(Item.sku).ilike(f"%{sku}%"))
    if title:
        stmt = stmt.where(col(Item.title).ilike(f"%{title}%"))
    rows = list(session.exec(stmt.limit(limit)).all())
    payload = [
        {
            "id": str(it.id),
            "title": it.title,
            "sku": it.sku,
            "status": it.status,
            "quantity": it.quantity,
            "row": it.storage_row,
            "level": it.storage_level,
            "cell_x": it.storage_cell_x,
            "cell_z": it.storage_cell_z,
        }
        for it in rows
    ]
    return _json({"count": len(payload), "items": payload})


def handle_get_inventory_summary(session: Session, user: User, _args: dict[str, Any], _ctx: Any) -> str:
    item_stmt = select(func.count()).select_from(Item)
    if not can_see_all_items(session, user):
        item_stmt = item_stmt.where(Item.owner_id == user.id)
    total_items = session.exec(item_stmt).one()

    wh_stmt = select(func.count()).select_from(Item).where(Item.status == "warehouse")
    if not can_see_all_items(session, user):
        wh_stmt = wh_stmt.where(Item.owner_id == user.id)
    on_wh = session.exec(wh_stmt).one()

    occ_stmt = select(func.count()).select_from(WarehouseSlotOccupancy)
    if not can_see_all_items(session, user):
        occ_stmt = occ_stmt.where(WarehouseSlotOccupancy.owner_id == user.id)
    occ = session.exec(occ_stmt).one()

    return _json(
        {
            "items_total_visible": int(total_items),
            "items_status_warehouse": int(on_wh),
            "occupied_slots_projection": int(occ),
        }
    )


def handle_find_item_by_sku(session: Session, user: User, args: dict[str, Any], _ctx: Any) -> str:
    sku = str(args.get("sku") or "").strip()
    if not sku:
        return _json({"error": "Укажите sku"})
    exact = bool(args.get("exact"))
    try:
        limit = int(args.get("limit") or 20)
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 50))
    stmt = _item_scope(session, user).where(col(Item.sku).is_not(None))
    if exact:
        stmt = stmt.where(Item.sku == sku)
    else:
        stmt = stmt.where(col(Item.sku).ilike(f"%{sku}%"))
    rows = list(session.exec(stmt.limit(limit)).all())
    return _json(
        {
            "count": len(rows),
            "items": [
                {
                    "id": str(it.id),
                    "sku": it.sku,
                    "title": it.title,
                    "status": it.status,
                    "row": it.storage_row,
                    "level": it.storage_level,
                    "cell_x": it.storage_cell_x,
                    "cell_z": it.storage_cell_z,
                }
                for it in rows
            ],
        }
    )


def handle_get_item_location(session: Session, user: User, args: dict[str, Any], _ctx: Any) -> str:
    item_id_s = str(args.get("item_id") or "").strip()
    sku = str(args.get("sku") or "").strip()
    stmt = _item_scope(session, user)
    if item_id_s:
        try:
            uid = uuid.UUID(item_id_s)
        except ValueError:
            return _json({"error": "Некорректный item_id"})
        stmt = stmt.where(Item.id == uid)
    elif sku:
        stmt = stmt.where(col(Item.sku).ilike(f"%{sku}%"))
    else:
        return _json({"error": "Укажите item_id или sku"})
    it = session.exec(stmt.limit(1)).first()
    if not it:
        return _json({"error": "Товар не найден"})
    return _json(
        {
            "id": str(it.id),
            "sku": it.sku,
            "title": it.title,
            "status": it.status,
            "storage_row": it.storage_row,
            "storage_level": it.storage_level,
            "storage_cell_x": it.storage_cell_x,
            "storage_cell_z": it.storage_cell_z,
        }
    )


def handle_get_slot_state(session: Session, user: User, args: dict[str, Any], _ctx: Any) -> str:
    slot_key = str(args.get("slot_key") or "").strip()
    try:
        limit = int(args.get("limit") or 25)
    except (TypeError, ValueError):
        limit = 25
    limit = max(1, min(limit, 100))
    if slot_key:
        occ_stmt = select(WarehouseSlotOccupancy).where(WarehouseSlotOccupancy.slot_key == slot_key)
        if not can_see_all_items(session, user):
            occ_stmt = occ_stmt.where(WarehouseSlotOccupancy.owner_id == user.id)
        row = session.exec(occ_stmt).first()
        if not row:
            return _json({"slot_key": slot_key, "occupied": False})
        return _json(
            {
                "slot_key": slot_key,
                "occupied": True,
                "item_id": str(row.item_id),
                "owner_id": str(row.owner_id),
            }
        )
    occ_stmt = select(WarehouseSlotOccupancy)
    if not can_see_all_items(session, user):
        occ_stmt = occ_stmt.where(WarehouseSlotOccupancy.owner_id == user.id)
    occ_stmt = occ_stmt.order_by(WarehouseSlotOccupancy.updated_at.desc()).limit(limit)
    rows = list(session.exec(occ_stmt).all())
    return _json(
        {
            "count": len(rows),
            "slots": [
                {"slot_key": r.slot_key, "item_id": str(r.item_id)} for r in rows
            ],
        }
    )


def handle_list_zone_congestion(session: Session, user: User, args: dict[str, Any], _ctx: Any) -> str:
    try:
        limit_z = int(args.get("limit_rows") or 20)
    except (TypeError, ValueError):
        limit_z = 20
    limit_z = max(1, min(limit_z, 50))
    layout = session.exec(select(WarehouseLayout).where(WarehouseLayout.is_active.is_(True))).first()
    wh_id = layout.warehouse_id if layout else _default_warehouse_id(session)
    if not wh_id:
        return _json({"zones": [], "note": "Склад не найден"})
    stmt = (
        select(WarehouseZone.name, func.count(Item.id))
        .select_from(Item)
        .join(
            WarehouseRack,
            and_(
                WarehouseRack.row_index == Item.storage_row,
                WarehouseRack.warehouse_id == wh_id,
                WarehouseRack.zone_id.is_not(None),
            ),
        )
        .join(WarehouseZone, WarehouseZone.id == WarehouseRack.zone_id)
        .where(Item.status == "warehouse")
        .where(col(Item.storage_row).is_not(None))
    )
    if not can_see_all_items(session, user):
        stmt = stmt.where(Item.owner_id == user.id)
    stmt = stmt.group_by(WarehouseZone.name).order_by(func.count(Item.id).desc()).limit(limit_z)
    rows = session.exec(stmt).all()
    return _json(
        {
            "zones": [{"zone_name": str(n), "item_count": int(c)} for n, c in rows],
            "note": "По привязке ряд→зона активного layout",
        }
    )


def handle_get_expiring_inventory(session: Session, user: User, args: dict[str, Any], _ctx: Any) -> str:
    try:
        days = int(args.get("days") or 30)
    except (TypeError, ValueError):
        days = 30
    days = max(1, min(days, 365))
    try:
        limit = int(args.get("limit") or 40)
    except (TypeError, ValueError):
        limit = 40
    limit = max(1, min(limit, 200))
    today = date.today()
    horizon = today + timedelta(days=days)
    stmt = (
        select(Item)
        .where(col(Item.expires_at).is_not(None))
        .where(col(Item.expires_at) >= today)
        .where(col(Item.expires_at) <= horizon)
        .where(Item.status == "warehouse")
    )
    if not can_see_all_items(session, user):
        stmt = stmt.where(Item.owner_id == user.id)
    stmt = stmt.order_by(Item.expires_at).limit(limit)
    rows = list(session.exec(stmt).all())
    return _json(
        {
            "horizon_days": days,
            "count": len(rows),
            "items": [
                {
                    "id": str(it.id),
                    "sku": it.sku,
                    "title": it.title,
                    "expires_at": str(it.expires_at),
                    "row": it.storage_row,
                }
                for it in rows
            ],
        }
    )


def handle_get_open_tasks(session: Session, _user: User, args: dict[str, Any], _ctx: Any) -> str:
    try:
        limit = int(args.get("limit") or 25)
    except (TypeError, ValueError):
        limit = 25
    limit = max(1, min(limit, 100))
    status_f = str(args.get("status") or "").strip()
    stmt = select(WarehouseTask).where(
        col(WarehouseTask.status).not_in(("completed", "cancelled", "done"))
    )
    if status_f:
        stmt = stmt.where(WarehouseTask.status == status_f)
    stmt = stmt.order_by(WarehouseTask.updated_at.desc()).limit(limit)
    rows = list(session.exec(stmt).all())
    return _json(
        {
            "count": len(rows),
            "tasks": [
                {
                    "id": str(t.id),
                    "task_type": t.task_type,
                    "status": t.status,
                    "priority": t.priority,
                    "warehouse_id": str(t.warehouse_id),
                }
                for t in rows
            ],
        }
    )


def handle_get_equipment_status(session: Session, _user: User, args: dict[str, Any], _ctx: Any) -> str:
    try:
        limit = int(args.get("limit") or 30)
    except (TypeError, ValueError):
        limit = 30
    limit = max(1, min(limit, 100))
    rows = list(session.exec(select(Equipment).limit(limit)).all())
    return _json(
        {
            "count": len(rows),
            "equipment": [
                {
                    "id": str(e.id),
                    "type": e.equipment_type,
                    "model": e.model,
                    "status": e.current_status,
                    "zone": e.zone,
                    "engine_hours": e.engine_hours,
                }
                for e in rows
            ],
        }
    )


def handle_get_recent_events(session: Session, user: User, args: dict[str, Any], _ctx: Any) -> str:
    if not can_read_audit(session, user):
        return _json({"error": "Нет права audit.read для просмотра событий"})
    try:
        limit = int(args.get("limit") or 30)
    except (TypeError, ValueError):
        limit = 30
    limit = max(1, min(limit, 100))
    prefix = str(args.get("event_type_prefix") or "").strip()
    stmt = select(DomainEvent)
    if prefix:
        stmt = stmt.where(col(DomainEvent.event_type).like(f"{prefix}%"))
    stmt = stmt.order_by(DomainEvent.occurred_at.desc()).limit(limit)
    rows = list(session.exec(stmt).all())
    return _json(
        {
            "count": len(rows),
            "events": [
                {
                    "id": str(e.id),
                    "event_type": e.event_type,
                    "occurred_at": e.occurred_at.isoformat(),
                    "aggregate_type": e.aggregate_type,
                    "aggregate_id": str(e.aggregate_id),
                }
                for e in rows
            ],
        }
    )


def handle_search_sop_documents(session: Session, _user: User, args: dict[str, Any], _ctx: Any) -> str:
    q = str(args.get("query") or "").strip().lower()
    if not q:
        return _json({"error": "Укажите query"})
    try:
        limit = int(args.get("limit") or 8)
    except (TypeError, ValueError):
        limit = 8
    limit = max(1, min(limit, 20))
    chunks = list(session.exec(select(AgentKnowledgeChunk)).all())
    tokens = [w for w in q.split() if len(w) > 1]
    scored: list[tuple[int, AgentKnowledgeChunk]] = []
    for c in chunks:
        blob = f"{c.title} {c.content}".lower()
        score = sum(1 for t in tokens if t in blob)
        scored.append((score, c))
    scored.sort(key=lambda x: x[0], reverse=True)
    top = [c for s, c in scored if s > 0][:limit]
    if not top:
        top = [c for _, c in scored[:limit]]
    return _json(
        {
            "count": len(top),
            "chunks": [
                {"id": str(c.id), "title": c.title, "snippet": c.content[:400]}
                for c in top
            ],
        }
    )


def handle_get_layout_topology(session: Session, _user: User, _args: dict[str, Any], _ctx: Any) -> str:
    layout = session.exec(select(WarehouseLayout).where(WarehouseLayout.is_active.is_(True))).first()
    if not layout:
        return _json({"error": "Нет активного layout"})
    spec = layout.spec if isinstance(layout.spec, dict) else {}
    parsed = parse_topology_from_spec(spec)
    if parsed is not None:
        topo = parsed.model_dump(mode="json")
    else:
        topo = default_topology_from_layout_spec(spec).model_dump(mode="json")
    return _json({"layout_code": layout.code, "version": layout.version, "topology": topo})


def handle_run_what_if_simulation(_session: Session, _user: User, args: dict[str, Any], _ctx: Any) -> str:
    try:
        duration = float(args.get("duration_hours") or 48)
    except (TypeError, ValueError):
        duration = 48.0
    pr = str(args.get("putaway_rule") or "nearest")
    if pr not in ("nearest", "round_robin", "random"):
        pr = "nearest"
    try:
        travel = float(args.get("layout_travel_scale") or 1.0)
    except (TypeError, ValueError):
        travel = 1.0
    cfg = SimulationConfig(
        duration_hours=max(1.0, min(duration, 8760.0)),
        dock_bays=int(args.get("dock_bays") or 2),
        num_forklifts=int(args.get("num_forklifts") or 3),
        num_operators=int(args.get("num_operators") or 5),
        putaway_rule=pr,  # type: ignore[arg-type]
        layout_travel_scale=travel,
    )
    result = run_discrete_event_simulation(cfg)
    return _json(
        {
            "kpis": asdict(result.kpis),
            "horizon_minutes": result.horizon_minutes,
            "note": "Только расчёт, данные склада в БД не менялись",
        }
    )


# --- act handlers (sandbox / confirm / minimal persist) ---


def handle_create_transfer_task(session: Session, user: User, args: dict[str, Any], ctx: AgentToolContext | None) -> str:
    wh_id = _default_warehouse_id(session)
    try:
        prio = int(args.get("priority") or 0)
    except (TypeError, ValueError):
        prio = 0
    payload = {
        "task_type": str(args.get("task_type") or "move"),
        "note": str(args.get("note") or ""),
        "priority": prio,
        "requested_by": str(user.id),
    }
    gated = _act_gate(ctx, tool_name="create_transfer_task", payload=payload)
    if gated:
        return gated
    if not wh_id:
        return _json({"error": "Нет склада для создания задания"})
    task = WarehouseTask(
        warehouse_id=wh_id,
        task_type=payload["task_type"][:32],
        status="pending",
        priority=prio,
        payload={"agent_note": payload["note"], "created_via": "agent"},
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return _json(
        {
            "ok": True,
            "task_id": str(task.id),
            "compensation_hint": f"Отмена: удалить warehouse_task id={task.id} или статус=cancelled",
        }
    )


def handle_reserve_slot(_session: Session, _user: User, args: dict[str, Any], ctx: AgentToolContext | None) -> str:
    payload = {"slot_key": args.get("slot_key"), "reason": args.get("reason")}
    gated = _act_gate(ctx, tool_name="reserve_slot", payload=payload)
    if gated:
        return gated
    return _json(
        {
            "ok": True,
            "note": "Резерв ячеек в модели данных не подключён; операция зафиксирована как no-op",
            "payload": payload,
        }
    )


def handle_create_cycle_count_task(session: Session, user: User, args: dict[str, Any], ctx: AgentToolContext | None) -> str:
    payload = {"scope": args.get("scope"), "hint": args.get("hint")}
    gated = _act_gate(ctx, tool_name="create_cycle_count_task", payload=payload)
    if gated:
        return gated
    wh_id = _default_warehouse_id(session)
    if not wh_id:
        return _json({"error": "Нет склада"})
    task = WarehouseTask(
        warehouse_id=wh_id,
        task_type="count",
        status="pending",
        payload={"scope": payload.get("scope"), "hint": payload.get("hint"), "by": str(user.id)},
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return _json(
        {"ok": True, "task_id": str(task.id), "compensation_hint": f"Удалить task {task.id}"}
    )


def handle_reassign_pick_task(_session: Session, _user: User, args: dict[str, Any], ctx: AgentToolContext | None) -> str:
    payload = {"task_id": args.get("task_id"), "assignee_user_id": args.get("assignee_user_id")}
    gated = _act_gate(ctx, tool_name="reassign_pick_task", payload=payload)
    if gated:
        return gated
    return _json({"ok": True, "note": "Назначение исполнителя через агента не реализовано (no-op)"})


def handle_create_maintenance_request(_session: Session, _user: User, args: dict[str, Any], ctx: AgentToolContext | None) -> str:
    payload = {"equipment_id": args.get("equipment_id"), "description": args.get("description")}
    gated = _act_gate(ctx, tool_name="create_maintenance_request", payload=payload)
    if gated:
        return gated
    return _json({"ok": True, "note": "Создание заявки ТО через агента — заглушка; используйте раздел Техника"})


def handle_acknowledge_alert(session: Session, user: User, args: dict[str, Any], ctx: AgentToolContext | None) -> str:
    nid = str(args.get("notification_id") or "").strip()
    payload = {"notification_id": nid}
    gated = _act_gate(ctx, tool_name="acknowledge_alert", payload=payload)
    if gated:
        return gated
    try:
        uid = uuid.UUID(nid)
    except ValueError:
        return _json({"error": "Некорректный notification_id"})
    n = session.exec(
        select(Notification).where(Notification.id == uid, Notification.user_id == user.id)
    ).first()
    if not n:
        return _json({"error": "Уведомление не найдено"})
    n.is_read = True
    n.read_at = datetime.now(timezone.utc)
    session.add(n)
    session.commit()
    return _json({"ok": True, "notification_id": nid, "compensation_hint": "Сбросить is_read вручную при ошибке"})


def handle_schedule_replenishment(_session: Session, _user: User, args: dict[str, Any], ctx: AgentToolContext | None) -> str:
    payload = {"sku": args.get("sku"), "quantity": args.get("quantity")}
    gated = _act_gate(ctx, tool_name="schedule_replenishment", payload=payload)
    if gated:
        return gated
    return _json({"ok": True, "note": "План пополнения не записан в БД (интеграция не подключена)"})


def handle_publish_layout_version(_session: Session, _user: User, args: dict[str, Any], ctx: AgentToolContext | None) -> str:
    payload = {"layout_id": args.get("layout_id")}
    gated = _act_gate(
        ctx, tool_name="publish_layout_version", payload=payload, superuser_only=True
    )
    if gated:
        return gated
    return _json({"ok": True, "note": "Публикация layout через агента отключена; используйте API warehouse/layouts"})


def handle_rebuild_projection(_session: Session, _user: User, args: dict[str, Any], ctx: AgentToolContext | None) -> str:
    payload = {"consumer": args.get("consumer")}
    gated = _act_gate(ctx, tool_name="rebuild_projection", payload=payload, superuser_only=True)
    if gated:
        return gated
    return _json({"ok": True, "note": "Вызовите POST /api/v1/projections/replay из UI/админки, не через агента"})


def handle_reindex_knowledge(_session: Session, _user: User, args: dict[str, Any], ctx: AgentToolContext | None) -> str:
    payload = {"chunk_id": args.get("chunk_id")}
    gated = _act_gate(ctx, tool_name="reindex_knowledge", payload=payload, superuser_only=True)
    if gated:
        return gated
    return _json({"ok": True, "note": "Используйте POST /api/v1/agent/knowledge/chunks/{id}/reindex"})


def handle_sync_external_system(_session: Session, _user: User, args: dict[str, Any], ctx: AgentToolContext | None) -> str:
    payload = {"system": args.get("system"), "entity": args.get("entity")}
    gated = _act_gate(ctx, tool_name="sync_external_system", payload=payload, superuser_only=True)
    if gated:
        return gated
    return _json({"ok": True, "note": "Синхронизация не настроена"})


HANDLERS: dict[str, Any] = {
    "search_items_in_warehouse": handle_search_items_in_warehouse,
    "get_inventory_summary": handle_get_inventory_summary,
    "find_item_by_sku": handle_find_item_by_sku,
    "get_item_location": handle_get_item_location,
    "get_slot_state": handle_get_slot_state,
    "list_zone_congestion": handle_list_zone_congestion,
    "get_expiring_inventory": handle_get_expiring_inventory,
    "get_open_tasks": handle_get_open_tasks,
    "get_equipment_status": handle_get_equipment_status,
    "get_recent_events": handle_get_recent_events,
    "search_sop_documents": handle_search_sop_documents,
    "get_layout_topology": handle_get_layout_topology,
    "run_what_if_simulation": handle_run_what_if_simulation,
    "create_transfer_task": handle_create_transfer_task,
    "reserve_slot": handle_reserve_slot,
    "create_cycle_count_task": handle_create_cycle_count_task,
    "reassign_pick_task": handle_reassign_pick_task,
    "create_maintenance_request": handle_create_maintenance_request,
    "acknowledge_alert": handle_acknowledge_alert,
    "schedule_replenishment": handle_schedule_replenishment,
    "publish_layout_version": handle_publish_layout_version,
    "rebuild_projection": handle_rebuild_projection,
    "reindex_knowledge": handle_reindex_knowledge,
    "sync_external_system": handle_sync_external_system,
}
