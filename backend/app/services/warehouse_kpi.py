"""
Операционные KPI склада: формулы + агрегация из БД.

Метрики:
- dock_to_stock_hours — от закрытия приёмки до done putaway
- stock_accuracy — доля строк инвентаризации без расхождения
- otif — доля отгрузок не позже ship_by_at
- tasks_per_hour / lines_per_hour — производительность по TaskExecution (fallback: WarehouseTask)
- order_cycle_hours — created_at → отгрузка
- equipment_downtime_hours — наряды ТО в статусе done (start/end или created→updated)
- mean_dwell_days / dead_stock_ratio — оборачиваемость и «залежи»
- dock_utilization — эвристика по касаниям отгрузок/приёмок на активные ворота
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import extract, func
from sqlmodel import Session, col, select

from app.models import (
    DockDoor,
    InboundOrder,
    InventoryCountAct,
    InventoryCountLine,
    Item,
    OutboundOrder,
    TaskExecution,
    User,
    WarehouseTask,
    WorkOrder,
)
from app.models.maintenance import WORK_ORDER_STATUS_DONE

DEAD_STOCK_DAYS = 90


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _parse_iso(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return _aware(value)
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip().replace("Z", "+00:00")
    try:
        return _aware(datetime.fromisoformat(raw))
    except ValueError:
        return None


def ratio(numerator: float, denominator: float) -> float | None:
    """Доля 0…1; None если нет базы."""
    if denominator <= 0:
        return None
    return round(max(0.0, min(1.0, numerator / denominator)), 4)


def mean(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 4)


def stock_accuracy_from_variances(variances: list[int | None]) -> float | None:
    """Точность запаса: строки с variance==0 / строки с внесённым фактом."""
    counted = [v for v in variances if v is not None]
    if not counted:
        return None
    perfect = sum(1 for v in counted if v == 0)
    return ratio(float(perfect), float(len(counted)))


def otif_from_shipments(
    rows: list[tuple[datetime, datetime | None]],
) -> float | None:
    """
    OTIF: отгрузка не позже ship_by_at.
    Если ship_by_at отсутствует — считаем on-time (срок не задан).
    """
    if not rows:
        return None
    on_time = 0
    for shipped_at, ship_by in rows:
        sa = _aware(shipped_at)
        sb = _aware(ship_by)
        if sa is None:
            continue
        if sb is None or sa <= sb:
            on_time += 1
    return ratio(float(on_time), float(len(rows)))


def productivity_rate(completed: int, hours: float) -> float | None:
    """Задач (или строк) в час."""
    if hours <= 0 or completed < 0:
        return None
    return round(completed / hours, 4)


def dock_to_stock_hours(
    receiving_closed_at: datetime,
    putaway_done_at: datetime,
) -> float | None:
    start = _aware(receiving_closed_at)
    end = _aware(putaway_done_at)
    if start is None or end is None or end < start:
        return None
    return round((end - start).total_seconds() / 3600.0, 4)


def order_cycle_hours(created_at: datetime, shipped_at: datetime) -> float | None:
    start = _aware(created_at)
    end = _aware(shipped_at)
    if start is None or end is None or end < start:
        return None
    return round((end - start).total_seconds() / 3600.0, 4)


def dock_utilization(
    touch_events: int,
    active_doors: int,
    window_hours: float,
    *,
    hours_per_touch: float = 1.0,
) -> float | None:
    """
    Эвристика загрузки ворот: (касания × часы/касание) / (двери × окно).
    Касание = отгрузка или закрытая приёмка в периоде.
    """
    capacity = active_doors * window_hours
    if capacity <= 0:
        return None
    busy = max(0.0, touch_events * hours_per_touch)
    return ratio(busy, capacity)


def dead_stock_ratio(total_warehouse: int, dead_count: int) -> float | None:
    return ratio(float(dead_count), float(total_warehouse))


def work_order_downtime_hours(
    start_at: datetime | None,
    end_at: datetime | None,
    *,
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
) -> float | None:
    """Часы простоя наряда: (end|updated) − (start|created)."""
    start = _aware(start_at) or _aware(created_at)
    end = _aware(end_at) or _aware(updated_at)
    if start is None or end is None or end < start:
        return None
    return round((end - start).total_seconds() / 3600.0, 4)


# Нормативы длительности заданий (минуты) для план-факта.
TASK_NORM_MINUTES: dict[str, float] = {
    "pick": 5.0,
    "putaway": 8.0,
    "move": 10.0,
    "replenish": 12.0,
    "count": 15.0,
}


def plan_fact_ratio(actual_minutes: float, norm_minutes: float) -> float | None:
    """
    Отношение факт/план: 1.0 = в нормативе, >1 — дольше плана.
    """
    if norm_minutes <= 0 or actual_minutes < 0:
        return None
    return round(actual_minutes / norm_minutes, 4)


@dataclass
class EmployeeProductivity:
    user_id: str
    email: str | None
    tasks_completed: int
    lines_completed: int
    hours: float
    tasks_per_hour: float | None
    lines_per_hour: float | None


@dataclass
class DowntimeBucket:
    reason: str
    hours: float
    work_orders: int


@dataclass
class WarehouseKpiSnapshot:
    from_date: str
    to_date: str
    dock_to_stock_hours_avg: float | None = None
    dock_to_stock_samples: int = 0
    stock_accuracy: float | None = None
    stock_accuracy_lines: int = 0
    otif: float | None = None
    otif_shipped: int = 0
    order_cycle_hours_avg: float | None = None
    order_cycle_samples: int = 0
    tasks_per_hour: float | None = None
    lines_per_hour: float | None = None
    productivity_by_employee: list[EmployeeProductivity] = field(default_factory=list)
    equipment_downtime_hours: float | None = None
    equipment_downtime_by_reason: list[DowntimeBucket] = field(default_factory=list)
    task_norm_plan_fact: float | None = None
    task_norm_samples: int = 0
    mean_dwell_days_warehouse: float | None = None
    dead_stock_ratio: float | None = None
    dead_stock_count: int = 0
    warehouse_items_total: int = 0
    dock_utilization: float | None = None
    dock_touch_events: int = 0
    active_dock_doors: int = 0
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _period_bounds(
    from_date: date | None, to_date: date | None
) -> tuple[date, date, datetime, datetime]:
    today = datetime.now(timezone.utc).date()
    end_d = to_date or today
    start_d = from_date or (end_d - timedelta(days=30))
    if start_d > end_d:
        start_d, end_d = end_d, start_d
    dt_from = datetime.combine(start_d, time.min).replace(tzinfo=timezone.utc)
    dt_to = datetime.combine(end_d, time.max).replace(tzinfo=timezone.utc)
    return start_d, end_d, dt_from, dt_to


def _window_hours(dt_from: datetime, dt_to: datetime) -> float:
    return max((dt_to - dt_from).total_seconds() / 3600.0, 0.0)


def compute_warehouse_kpis(
    session: Session,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    dead_stock_days: int = DEAD_STOCK_DAYS,
) -> WarehouseKpiSnapshot:
    start_d, end_d, dt_from, dt_to = _period_bounds(from_date, to_date)
    snap = WarehouseKpiSnapshot(
        from_date=start_d.isoformat(), to_date=end_d.isoformat()
    )
    window_h = _window_hours(dt_from, dt_to)

    # --- stock accuracy (проведённые акты) ---
    acts = list(
        session.exec(
            select(InventoryCountAct).where(
                InventoryCountAct.status == "posted",
                col(InventoryCountAct.posted_at).is_not(None),
                col(InventoryCountAct.posted_at) >= dt_from,
                col(InventoryCountAct.posted_at) <= dt_to,
            )
        ).all()
    )
    act_ids = [a.id for a in acts]
    variances: list[int | None] = []
    if act_ids:
        lines = session.exec(
            select(InventoryCountLine).where(
                col(InventoryCountLine.act_id).in_(act_ids)
            )
        ).all()
        variances = [ln.variance for ln in lines]
    snap.stock_accuracy = stock_accuracy_from_variances(variances)
    snap.stock_accuracy_lines = sum(1 for v in variances if v is not None)

    # --- OTIF + order cycle ---
    shipped = list(
        session.exec(
            select(OutboundOrder).where(
                OutboundOrder.status == "shipped",
                OutboundOrder.updated_at >= dt_from,
                OutboundOrder.updated_at <= dt_to,
            )
        ).all()
    )
    otif_rows: list[tuple[datetime, datetime | None]] = []
    cycles: list[float] = []
    for order in shipped:
        shipped_at = order.updated_at
        extra = order.extra if isinstance(order.extra, dict) else {}
        ff_raw = extra.get("fulfillment")
        fulfillment: dict[str, Any] = ff_raw if isinstance(ff_raw, dict) else {}
        shipped_at = _parse_iso(fulfillment.get("shipped_at")) or shipped_at
        if shipped_at is None:
            continue
        otif_rows.append((shipped_at, order.ship_by_at))
        ch = order_cycle_hours(order.created_at, shipped_at)
        if ch is not None:
            cycles.append(ch)
    snap.otif = otif_from_shipments(otif_rows)
    snap.otif_shipped = len(otif_rows)
    snap.order_cycle_hours_avg = mean(cycles)
    snap.order_cycle_samples = len(cycles)

    # --- dock-to-stock ---
    dts_hours: list[float] = []
    putaways = list(
        session.exec(
            select(WarehouseTask).where(
                WarehouseTask.task_type == "putaway",
                col(WarehouseTask.status).in_(("completed", "done")),
                WarehouseTask.updated_at >= dt_from,
                WarehouseTask.updated_at <= dt_to,
            )
        ).all()
    )
    # group putaway done by order_id → max updated_at
    putaway_done_by_order: dict[str, datetime] = {}
    for task in putaways:
        payload = task.payload if isinstance(task.payload, dict) else {}
        oid = str(payload.get("order_id") or "")
        if not oid:
            continue
        prev = putaway_done_by_order.get(oid)
        if prev is None or task.updated_at > prev:
            putaway_done_by_order[oid] = task.updated_at

    if putaway_done_by_order:
        order_uuids: list[UUID] = []
        for key in putaway_done_by_order:
            try:
                order_uuids.append(UUID(key))
            except ValueError:
                continue
        if order_uuids:
            inbounds = session.exec(
                select(InboundOrder).where(col(InboundOrder.id).in_(order_uuids))
            ).all()
            for inbound in inbounds:
                extra = inbound.extra if isinstance(inbound.extra, dict) else {}
                ff_raw = extra.get("fulfillment")
                inbound_ff: dict[str, Any] = ff_raw if isinstance(ff_raw, dict) else {}
                closed = _parse_iso(inbound_ff.get("receiving_closed_at"))
                done_at = putaway_done_by_order.get(str(inbound.id))
                if closed is None or done_at is None:
                    continue
                h = dock_to_stock_hours(closed, done_at)
                if h is not None:
                    dts_hours.append(h)
    snap.dock_to_stock_hours_avg = mean(dts_hours)
    snap.dock_to_stock_samples = len(dts_hours)

    # --- productivity (TaskExecution preferred, else done WarehouseTask) ---
    executions = list(
        session.exec(
            select(TaskExecution).where(
                col(TaskExecution.completed_at).is_not(None),
                col(TaskExecution.completed_at) >= dt_from,
                col(TaskExecution.completed_at) <= dt_to,
            )
        ).all()
    )
    by_user: dict[str | None, list[TaskExecution]] = defaultdict(list)
    for ex in executions:
        by_user[str(ex.actor_user_id) if ex.actor_user_id else None].append(ex)

    # Fallback tasks when no executions
    if not executions:
        snap.notes.append(
            "TaskExecution пуст за период — производительность по WarehouseTask.status=completed"
        )
        done_tasks = list(
            session.exec(
                select(WarehouseTask).where(
                    col(WarehouseTask.status).in_(("completed", "done")),
                    WarehouseTask.updated_at >= dt_from,
                    WarehouseTask.updated_at <= dt_to,
                )
            ).all()
        )
        total_tasks = len(done_tasks)
        snap.tasks_per_hour = productivity_rate(total_tasks, window_h)
        # lines ≈ tasks for pick/putaway
        snap.lines_per_hour = snap.tasks_per_hour
        emp: dict[str | None, list[WarehouseTask]] = defaultdict(list)
        for t in done_tasks:
            emp[str(t.assigned_user_id) if t.assigned_user_id else None].append(t)
        emails = _user_emails(session, [k for k in emp if k])
        for uid, tasks in emp.items():
            if uid is None:
                continue
            # hours = sum of durations or share of window
            hours = 0.0
            for t in tasks:
                start = _aware(t.created_at)
                end = _aware(t.updated_at)
                if start and end and end >= start:
                    hours += (end - start).total_seconds() / 3600.0
            hours = hours or window_h
            n = len(tasks)
            snap.productivity_by_employee.append(
                EmployeeProductivity(
                    user_id=uid,
                    email=emails.get(uid),
                    tasks_completed=n,
                    lines_completed=n,
                    hours=round(hours, 4),
                    tasks_per_hour=productivity_rate(n, hours),
                    lines_per_hour=productivity_rate(n, hours),
                )
            )
    else:
        total_tasks = len(executions)
        total_hours = 0.0
        emails = _user_emails(session, [k for k in by_user if k])
        for uid, rows in by_user.items():
            hours = 0.0
            line_count = 0
            for ex in rows:
                start = _aware(ex.started_at)
                end = _aware(ex.completed_at)
                if start and end and end >= start:
                    hours += (end - start).total_seconds() / 3600.0
                result = ex.result if isinstance(ex.result, dict) else {}
                try:
                    line_count += int(
                        result.get("lines") or result.get("quantity") or 1
                    )
                except (TypeError, ValueError):
                    line_count += 1
            total_hours += hours
            if uid is None:
                continue
            hours = hours or 0.001
            snap.productivity_by_employee.append(
                EmployeeProductivity(
                    user_id=uid,
                    email=emails.get(uid),
                    tasks_completed=len(rows),
                    lines_completed=line_count,
                    hours=round(hours, 4),
                    tasks_per_hour=productivity_rate(len(rows), hours),
                    lines_per_hour=productivity_rate(line_count, hours),
                )
            )
        snap.tasks_per_hour = productivity_rate(total_tasks, total_hours or window_h)
        total_lines = sum(p.lines_completed for p in snap.productivity_by_employee)
        snap.lines_per_hour = productivity_rate(total_lines, total_hours or window_h)

    snap.productivity_by_employee.sort(
        key=lambda p: p.tasks_per_hour or 0.0, reverse=True
    )

    # --- equipment downtime ---
    work_orders = list(
        session.exec(
            select(WorkOrder).where(
                WorkOrder.status == WORK_ORDER_STATUS_DONE,
                WorkOrder.updated_at >= dt_from,
                WorkOrder.updated_at <= dt_to,
            )
        ).all()
    )
    reason_hours: dict[str, list[float]] = defaultdict(list)
    total_down = 0.0
    for wo in work_orders:
        h = work_order_downtime_hours(
            wo.start_at,
            wo.end_at,
            created_at=wo.created_at,
            updated_at=wo.updated_at,
        )
        if h is None:
            continue
        total_down += h
        reason = (wo.title or "ТО/ремонт").strip()[:80] or "ТО/ремонт"
        reason_hours[reason].append(h)
    snap.equipment_downtime_hours = round(total_down, 4) if work_orders else None
    snap.equipment_downtime_by_reason = [
        DowntimeBucket(reason=r, hours=round(sum(hs), 4), work_orders=len(hs))
        for r, hs in sorted(reason_hours.items(), key=lambda x: -sum(x[1]))
    ][:10]

    # --- plan-fact по нормативам TaskExecution ---
    pf_ratios: list[float] = []
    task_ids = list({ex.warehouse_task_id for ex in executions})
    task_type_by_id: dict[UUID, str] = {}
    if task_ids:
        for t in session.exec(
            select(WarehouseTask).where(col(WarehouseTask.id).in_(task_ids))
        ).all():
            task_type_by_id[t.id] = t.task_type
    for ex in executions:
        if ex.status != "completed" or ex.completed_at is None:
            continue
        ttype = task_type_by_id.get(ex.warehouse_task_id)
        norm = TASK_NORM_MINUTES.get(ttype or "", 0.0)
        if norm <= 0:
            continue
        start = _aware(ex.started_at)
        end = _aware(ex.completed_at)
        if start is None or end is None or end < start:
            continue
        actual_min = (end - start).total_seconds() / 60.0
        pf = plan_fact_ratio(actual_min, norm)
        if pf is not None:
            pf_ratios.append(pf)
    snap.task_norm_plan_fact = mean(pf_ratios)
    snap.task_norm_samples = len(pf_ratios)

    # --- dwell + dead stock ---
    # Средний возраст остатка: (now - created_at) в секундах
    dwell_expr = extract("epoch", func.now() - Item.created_at)
    dwell_sec = session.exec(
        select(func.avg(dwell_expr)).where(Item.status == "warehouse")
    ).one()
    if dwell_sec is not None:
        snap.mean_dwell_days_warehouse = round(float(dwell_sec) / 86400.0, 3)

    cutoff = datetime.now(timezone.utc) - timedelta(days=dead_stock_days)
    total_wh = int(
        session.exec(
            select(func.count()).select_from(Item).where(Item.status == "warehouse")
        ).one()
        or 0
    )
    dead = int(
        session.exec(
            select(func.count())
            .select_from(Item)
            .where(Item.status == "warehouse", Item.created_at <= cutoff)
        ).one()
        or 0
    )
    snap.warehouse_items_total = total_wh
    snap.dead_stock_count = dead
    snap.dead_stock_ratio = dead_stock_ratio(total_wh, dead)

    # --- dock utilization ---
    active_doors = int(
        session.exec(
            select(func.count())
            .select_from(DockDoor)
            .where(col(DockDoor.is_active).is_(True))
        ).one()
        or 0
    )
    inbound_closed = list(
        session.exec(
            select(InboundOrder).where(
                col(InboundOrder.status).in_(("received", "closed")),
                InboundOrder.updated_at >= dt_from,
                InboundOrder.updated_at <= dt_to,
            )
        ).all()
    )
    # считать только с receiving_closed_at в периоде
    inbound_touches = 0
    for inbound in inbound_closed:
        extra = inbound.extra if isinstance(inbound.extra, dict) else {}
        ff_raw = extra.get("fulfillment")
        inbound_ff_touch: dict[str, Any] = ff_raw if isinstance(ff_raw, dict) else {}
        closed = _parse_iso(inbound_ff_touch.get("receiving_closed_at"))
        if closed and dt_from <= closed <= dt_to:
            inbound_touches += 1
        elif closed is None:
            inbound_touches += 1
    touches = len(shipped) + inbound_touches
    snap.active_dock_doors = active_doors
    snap.dock_touch_events = touches
    if active_doors == 0:
        snap.notes.append("Нет активных dock_door — dock_utilization не считается")
        snap.dock_utilization = None
    else:
        snap.dock_utilization = dock_utilization(touches, active_doors, window_h)
        snap.notes.append(
            "dock_utilization: эвристика 1 ч × касание (приёмка/отгрузка) / (двери × окно)"
        )

    return snap


def _user_emails(session: Session, user_ids: list[str]) -> dict[str, str]:
    uuids: list[UUID] = []
    for raw in user_ids:
        try:
            uuids.append(UUID(raw))
        except ValueError:
            continue
    if not uuids:
        return {}
    rows = session.exec(select(User).where(col(User.id).in_(uuids))).all()
    return {str(u.id): u.email for u in rows}


def warehouse_kpi_csv(snapshot: WarehouseKpiSnapshot) -> str:
    """Простой CSV для экспорта сводки."""
    d = snapshot.to_dict()
    lines = ["metric,value"]
    skip = {
        "productivity_by_employee",
        "equipment_downtime_by_reason",
        "notes",
    }
    for key, value in d.items():
        if key in skip:
            continue
        lines.append(f"{key},{value if value is not None else ''}")
    lines.append("")
    lines.append(
        "employee_user_id,email,tasks_completed,lines_completed,hours,tasks_per_hour,lines_per_hour"
    )
    for emp in snapshot.productivity_by_employee:
        lines.append(
            f"{emp.user_id},{emp.email or ''},{emp.tasks_completed},"
            f"{emp.lines_completed},{emp.hours},"
            f"{emp.tasks_per_hour if emp.tasks_per_hour is not None else ''},"
            f"{emp.lines_per_hour if emp.lines_per_hour is not None else ''}"
        )
    lines.append("")
    lines.append("downtime_reason,hours,work_orders")
    for bucket in snapshot.equipment_downtime_by_reason:
        safe = bucket.reason.replace(",", ";")
        lines.append(f"{safe},{bucket.hours},{bucket.work_orders}")
    return "\n".join(lines) + "\n"
