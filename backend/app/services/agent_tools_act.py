"""Act-инструменты агента (запись в БД: задачи, слоты, layout, интеграция)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session, col, select

from app.agent.contracts import AgentToolContext
from app.models import (
    LAYOUT_LIFECYCLE_PUBLISHED,
    WORK_ORDER_PRIORITIES,
    WORK_ORDER_PRIORITY_MEDIUM,
    WORK_ORDER_STATUS_OPEN,
    Equipment,
    IntegrationInbox,
    Item,
    Notification,
    StorageBin,
    User,
    WarehouseLayout,
    WarehouseSlotOccupancy,
    WarehouseTask,
    WorkOrder,
)
from app.services.agent_knowledge_embed import embed_all_chunks_sync
from app.services.agent_tools_common import _act_gate, _default_warehouse_id, _json
from app.services.notification_service import create_notification
from app.services.warehouse_slot_projection import refresh_warehouse_slot_projection


def handle_create_transfer_task(
    session: Session, user: User, args: dict[str, Any], ctx: AgentToolContext | None
) -> str:
    wh_id = _default_warehouse_id(session)
    try:
        prio = int(args.get("priority") or 0)
    except (TypeError, ValueError):
        prio = 0
    payload: dict[str, Any] = {
        "task_type": str(args.get("task_type") or "move"),
        "note": str(args.get("note") or ""),
        "priority": prio,
        "requested_by": str(user.id),
        "slot_key": str(args.get("slot_key") or "").strip() or None,
        "item_id": str(args.get("item_id") or "").strip() or None,
    }
    gated = _act_gate(ctx, tool_name="create_transfer_task", payload=payload)
    if gated:
        return gated
    if not wh_id:
        return _json({"error": "Нет склада для создания задания"})
    task = WarehouseTask(
        warehouse_id=wh_id,
        task_type=str(payload["task_type"])[:32],
        status="pending",
        priority=prio,
        payload={
            "agent_note": payload["note"],
            "created_via": "agent",
            **(
                {
                    k: v
                    for k, v in (
                        ("slot_key", payload["slot_key"]),
                        ("item_id", payload["item_id"]),
                    )
                    if v
                }
            ),
        },
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


def handle_reserve_slot(
    session: Session, _user: User, args: dict[str, Any], ctx: AgentToolContext | None
) -> str:
    slot_key = str(args.get("slot_key") or "").strip()
    item_id_s = str(args.get("item_id") or "").strip()
    reason = str(args.get("reason") or "")
    payload = {"slot_key": slot_key, "item_id": item_id_s, "reason": reason}
    gated = _act_gate(ctx, tool_name="reserve_slot", payload=payload)
    if gated:
        return gated
    if not slot_key:
        return _json({"error": "Укажите slot_key"})
    if not item_id_s:
        return _json({"error": "Укажите item_id для резервирования ячейки"})

    sbin = session.exec(
        select(StorageBin).where(
            StorageBin.slot_key == slot_key, col(StorageBin.is_active).is_(True)
        )
    ).first()
    if not sbin:
        return _json({"error": f"Ячейка {slot_key} не найдена или не активна"})

    existing_occ = session.exec(
        select(WarehouseSlotOccupancy).where(
            WarehouseSlotOccupancy.slot_key == slot_key
        )
    ).first()
    if existing_occ:
        return _json(
            {"error": f"Ячейка {slot_key} уже занята (item_id={existing_occ.item_id})"}
        )

    try:
        item_uid = uuid.UUID(item_id_s)
    except ValueError:
        return _json({"error": "Некорректный item_id"})
    item = session.get(Item, item_uid)
    if not item:
        return _json({"error": "Товар не найден"})

    occ = WarehouseSlotOccupancy(
        slot_key=slot_key,
        item_id=item.id,
        owner_id=item.owner_id,
        updated_at=datetime.now(timezone.utc),
    )
    session.add(occ)
    session.commit()
    return _json(
        {
            "ok": True,
            "slot_key": slot_key,
            "item_id": str(item.id),
            "compensation_hint": f"Удалить запись occupancy slot_key={slot_key}",
        }
    )


def handle_create_cycle_count_task(
    session: Session, user: User, args: dict[str, Any], ctx: AgentToolContext | None
) -> str:
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
        payload={
            "scope": payload.get("scope"),
            "hint": payload.get("hint"),
            "by": str(user.id),
        },
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return _json(
        {
            "ok": True,
            "task_id": str(task.id),
            "compensation_hint": f"Удалить task {task.id}",
        }
    )


def handle_reassign_pick_task(
    session: Session, _user: User, args: dict[str, Any], ctx: AgentToolContext | None
) -> str:
    task_id_s = str(args.get("task_id") or "").strip()
    new_user_id_s = str(args.get("assignee_user_id") or "").strip()
    payload = {"task_id": task_id_s, "assignee_user_id": new_user_id_s}
    gated = _act_gate(ctx, tool_name="reassign_pick_task", payload=payload)
    if gated:
        return gated
    if not task_id_s:
        return _json({"error": "Укажите task_id"})
    if not new_user_id_s:
        return _json({"error": "Укажите assignee_user_id"})

    try:
        task_uid = uuid.UUID(task_id_s)
    except ValueError:
        return _json({"error": "Некорректный task_id"})
    try:
        new_user_uid = uuid.UUID(new_user_id_s)
    except ValueError:
        return _json({"error": "Некорректный assignee_user_id"})

    task = session.get(WarehouseTask, task_uid)
    if not task:
        return _json({"error": "Задание не найдено"})
    new_user = session.get(User, new_user_uid)
    if not new_user:
        return _json({"error": "Пользователь-исполнитель не найден"})

    old_user_id = task.assigned_user_id
    task.assigned_user_id = new_user_uid
    task.updated_at = datetime.now(timezone.utc)
    session.add(task)

    create_notification(
        session,
        new_user_uid,
        type="task_assigned",
        title=f"Вам назначено задание: {task.task_type}",
        body=f"Задание {task.id} ({task.task_type}) переназначено вам.",
        source="Агент",
        entity_type="warehouse_task",
        entity_id=task.id,
    )
    session.commit()
    return _json(
        {
            "ok": True,
            "task_id": str(task.id),
            "previous_assignee": str(old_user_id) if old_user_id else None,
            "new_assignee": str(new_user_uid),
            "compensation_hint": f"Переназначить задание {task.id} обратно на {old_user_id}",
        }
    )


def handle_create_maintenance_request(
    session: Session, user: User, args: dict[str, Any], ctx: AgentToolContext | None
) -> str:
    eq_id_s = str(args.get("equipment_id") or "").strip()
    description = str(args.get("description") or "").strip()
    priority = str(args.get("priority") or WORK_ORDER_PRIORITY_MEDIUM).strip()
    payload = {
        "equipment_id": eq_id_s,
        "description": description,
        "priority": priority,
    }
    gated = _act_gate(ctx, tool_name="create_maintenance_request", payload=payload)
    if gated:
        return gated
    if not eq_id_s:
        return _json({"error": "Укажите equipment_id"})

    try:
        eq_uid = uuid.UUID(eq_id_s)
    except ValueError:
        return _json({"error": "Некорректный equipment_id"})
    equipment = session.get(Equipment, eq_uid)
    if not equipment:
        return _json({"error": "Единица техники не найдена"})

    if priority not in WORK_ORDER_PRIORITIES:
        priority = WORK_ORDER_PRIORITY_MEDIUM

    eq_label = equipment.garage_number or equipment.model
    wo = WorkOrder(
        equipment_id=equipment.id,
        title=f"Заявка ТО: {eq_label}",
        description=description or None,
        status=WORK_ORDER_STATUS_OPEN,
        priority=priority,
        created_by_id=user.id,
    )
    session.add(wo)
    session.commit()
    session.refresh(wo)
    return _json(
        {
            "ok": True,
            "work_order_id": str(wo.id),
            "equipment_id": str(equipment.id),
            "title": wo.title,
            "status": wo.status,
            "priority": wo.priority,
            "compensation_hint": f"Удалить или отменить work_order id={wo.id}",
        }
    )


def handle_acknowledge_alert(
    session: Session, user: User, args: dict[str, Any], ctx: AgentToolContext | None
) -> str:
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
        select(Notification).where(
            Notification.id == uid, Notification.user_id == user.id
        )
    ).first()
    if not n:
        return _json({"error": "Уведомление не найдено"})
    n.is_read = True
    n.read_at = datetime.now(timezone.utc)
    session.add(n)
    session.commit()
    return _json(
        {
            "ok": True,
            "notification_id": nid,
            "compensation_hint": "Сбросить is_read вручную при ошибке",
        }
    )


def handle_schedule_replenishment(
    session: Session, user: User, args: dict[str, Any], ctx: AgentToolContext | None
) -> str:
    sku = str(args.get("sku") or "").strip()
    item_id_s = str(args.get("item_id") or "").strip()
    zone_id_s = str(args.get("zone_id") or "").strip()
    payload = {
        "sku": sku,
        "item_id": item_id_s,
        "zone_id": zone_id_s,
        "quantity": args.get("quantity"),
    }
    gated = _act_gate(ctx, tool_name="schedule_replenishment", payload=payload)
    if gated:
        return gated

    try:
        qty = int(args.get("quantity") or 0)
    except (TypeError, ValueError):
        qty = 0
    if qty <= 0:
        return _json({"error": "Укажите quantity > 0"})

    wh_id = _default_warehouse_id(session)
    if not wh_id:
        return _json({"error": "Нет склада для создания задания"})

    try:
        prio = int(args.get("priority") or 0)
    except (TypeError, ValueError):
        prio = 0

    task = WarehouseTask(
        warehouse_id=wh_id,
        task_type="replenish",
        status="pending",
        priority=prio,
        payload={
            "sku": sku or None,
            "item_id": item_id_s or None,
            "zone_id": zone_id_s or None,
            "quantity": qty,
            "created_via": "agent",
            "requested_by": str(user.id),
        },
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return _json(
        {
            "ok": True,
            "task_id": str(task.id),
            "task_type": task.task_type,
            "quantity": qty,
            "compensation_hint": f"Удалить или отменить warehouse_task id={task.id}",
        }
    )


def handle_publish_layout_version(
    session: Session, _user: User, args: dict[str, Any], ctx: AgentToolContext | None
) -> str:
    layout_id_s = str(args.get("layout_id") or "").strip()
    payload = {"layout_id": layout_id_s}
    gated = _act_gate(
        ctx, tool_name="publish_layout_version", payload=payload, superuser_only=True
    )
    if gated:
        return gated
    if not layout_id_s:
        return _json({"error": "Укажите layout_id"})

    try:
        layout_uid = uuid.UUID(layout_id_s)
    except ValueError:
        return _json({"error": "Некорректный layout_id"})
    layout = session.get(WarehouseLayout, layout_uid)
    if not layout:
        return _json({"error": "Layout не найден"})

    previously_active = session.exec(
        select(WarehouseLayout).where(
            col(WarehouseLayout.is_active).is_(True),
            WarehouseLayout.id != layout.id,
        )
    ).all()
    now = datetime.now(timezone.utc)
    for al in previously_active:
        al.is_active = False
        session.add(al)

    layout.is_active = True
    layout.lifecycle_status = LAYOUT_LIFECYCLE_PUBLISHED
    layout.published_at = now
    layout.activated_at = now
    session.add(layout)
    session.commit()
    return _json(
        {
            "ok": True,
            "layout_id": str(layout.id),
            "code": layout.code,
            "version": layout.version,
            "deactivated_count": len(previously_active),
            "compensation_hint": f"Деактивировать layout {layout.id}: is_active=False",
        }
    )


def handle_rebuild_projection(
    session: Session, _user: User, args: dict[str, Any], ctx: AgentToolContext | None
) -> str:
    payload = {"consumer": args.get("consumer")}
    gated = _act_gate(
        ctx, tool_name="rebuild_projection", payload=payload, superuser_only=True
    )
    if gated:
        return gated

    try:
        count = refresh_warehouse_slot_projection(session)
        session.commit()
    except Exception as exc:
        return _json({"error": f"Ошибка пересчёта проекции: {exc}"})
    return _json(
        {
            "ok": True,
            "slots_refreshed": count,
            "compensation_hint": "Повторный вызов rebuild_projection сбросит и пересчитает проекцию",
        }
    )


def handle_reindex_knowledge(
    session: Session, _user: User, args: dict[str, Any], ctx: AgentToolContext | None
) -> str:
    payload = {"chunk_id": args.get("chunk_id")}
    gated = _act_gate(
        ctx, tool_name="reindex_knowledge", payload=payload, superuser_only=True
    )
    if gated:
        return gated

    # Синхронный HTTP-путь: оркестратор уже вызывает handler через to_thread,
    # asyncio.run здесь запрещён (блокирует поток до 600 с / ломает вложенный loop).
    try:
        ok, fail = embed_all_chunks_sync(session)
        session.commit()
    except Exception as exc:
        session.rollback()
        return _json({"error": f"Ошибка переиндексации: {exc}"})
    session.expire_all()
    return _json(
        {
            "ok": True,
            "chunks_embedded": ok,
            "chunks_failed": fail,
            "compensation_hint": "Повторный вызов reindex_knowledge пересчитает все эмбеддинги",
        }
    )


def handle_enqueue_integration_inbox(
    session: Session,
    _user: User,
    args: dict[str, Any],
    ctx: AgentToolContext | None,
) -> str:
    source = str(args.get("source") or "").strip()
    event_type = str(args.get("event_type") or "").strip()
    payload = args.get("payload")
    if not source or not event_type:
        return _json({"error": "Укажите source и event_type"})
    if not isinstance(payload, dict):
        return _json({"error": "payload должен быть JSON-объектом"})
    gate_payload = {
        "source": source,
        "event_type": event_type,
        "payload_keys": sorted(str(k) for k in payload.keys())[:40],
    }
    gated = _act_gate(ctx, tool_name="enqueue_integration_inbox", payload=gate_payload)
    if gated:
        return gated
    row = IntegrationInbox(
        source=source[:128],
        event_type=event_type[:128],
        payload=payload,
        status="pending",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _json(
        {
            "ok": True,
            "integration_inbox_id": str(row.id),
            "status": row.status,
            "message": "Событие принято в inbox; обработка — воркером/коннектором",
            "compensation_hint": "Повторный enqueue с тем же ключом создаст новую запись; "
            "отмена — смена статуса inbox воркером",
        }
    )


def handle_sync_external_system(
    _session: Session, _user: User, args: dict[str, Any], ctx: AgentToolContext | None
) -> str:
    payload = {"system": args.get("system"), "entity": args.get("entity")}
    gated = _act_gate(
        ctx, tool_name="sync_external_system", payload=payload, superuser_only=True
    )
    if gated:
        return gated
    return _json(
        {
            "ok": False,
            "note": "Используйте инструмент enqueue_integration_inbox для доставки во внешний контур",
            "legacy_payload": payload,
        }
    )
