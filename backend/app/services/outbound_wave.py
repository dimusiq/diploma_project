"""
Волновой и зонный отбор: группа заказов → один маршрут по ячейкам.

Позаказный ``plan_outbound_picks`` остаётся; волна строится поверх уже
созданных (или только что спланированных) pick-задач.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, col, select

from app.models import (
    FeatureFlag,
    OutboundOrder,
    PickWave,
    PickWaveOrder,
    PickWaveZoneAssignment,
    Shipment,
    Warehouse,
    WarehouseTask,
)
from app.services.feature_flags import is_feature_enabled
from app.services.outbound_fulfillment import related_tasks
from app.services.outbound_planning import plan_outbound_picks
from app.warehouse_sim.layout import (
    BLOCK_COUNT,
    PACKING_POINT,
    RACK_BAYS,
    _cell_approach,
    build_racks,
    distance,
    route_between,
)

FEATURE_OUTBOUND_WAVE = "outbound_wave_picking"
WAVE_STATUSES_PLANABLE = frozenset({"draft", "planned"})
WAVE_MODES = frozenset({"batch", "zone"})

_RACKS_CACHE: list[dict[str, Any]] | None = None


def ensure_wave_feature(session: Session) -> None:
    """Флаг outbound_wave_picking должен быть включён для API волн."""
    if not is_feature_enabled(session, FEATURE_OUTBOUND_WAVE):
        raise HTTPException(
            status_code=409,
            detail=(
                "Волновой отбор выключен (feature flag "
                f"{FEATURE_OUTBOUND_WAVE}). Включите флаг или используйте "
                "позаказный режим."
            ),
        )


def enable_wave_feature_for_tests(session: Session) -> None:
    """Включает флаг в тестовой сессии (идемпотентно)."""
    row = session.exec(
        select(FeatureFlag).where(FeatureFlag.key == FEATURE_OUTBOUND_WAVE)
    ).first()
    if row is None:
        session.add(
            FeatureFlag(
                key=FEATURE_OUTBOUND_WAVE,
                enabled=True,
                description="Волновой/зонный отбор",
            )
        )
    else:
        row.enabled = True
        session.add(row)
    session.commit()


def _racks() -> list[dict[str, Any]]:
    global _RACKS_CACHE
    if _RACKS_CACHE is None:
        _RACKS_CACHE = build_racks()
    return _RACKS_CACHE


def zone_code_for_row(storage_row: int | None) -> str:
    """Зона = блок стеллажей B01…B08 по storage_row."""
    if storage_row is None or storage_row < 1:
        return "B00"
    rack_n = min(BLOCK_COUNT, max(1, (int(storage_row) + 1) // 2))
    return f"B{rack_n:02d}"


def slot_approach(
    storage_row: int | None, storage_cell_x: int | None
) -> dict[str, float]:
    """Точка подъезда к ячейке в координатах layout (для route_between)."""
    if storage_row is None or storage_cell_x is None:
        return dict(PACKING_POINT)
    row = max(1, int(storage_row))
    rack_n = min(BLOCK_COUNT, max(1, (row + 1) // 2))
    side = "A" if row % 2 == 1 else "B"
    bay = max(1, min(RACK_BAYS, int(storage_cell_x)))
    rack_id = f"rack-{rack_n}-{side}"
    rack = next((r for r in _racks() if r["id"] == rack_id), None)
    if rack is None:
        return dict(PACKING_POINT)
    return _cell_approach(rack, bay)


def segment_length_m(a: dict[str, float], b: dict[str, float]) -> float:
    path = route_between(a, b)
    prev = a
    total = 0.0
    for point in path:
        total += distance(prev, point)
        prev = point
    return total


def tour_length_m(
    stops: list[dict[str, float]], *, start: dict[str, float] | None = None
) -> float:
    """Длина тура start → stops (по порядку) → start."""
    origin = start or dict(PACKING_POINT)
    if not stops:
        return 0.0
    total = 0.0
    cur = origin
    for stop in stops:
        total += segment_length_m(cur, stop)
        cur = stop
    total += segment_length_m(cur, origin)
    return total


def nearest_neighbor_order(
    tasks: list[WarehouseTask], *, start: dict[str, float] | None = None
) -> list[WarehouseTask]:
    """Жадный NN-порядок задач по точкам подъезда к ячейкам."""
    origin = start or dict(PACKING_POINT)
    remaining = list(tasks)
    ordered: list[WarehouseTask] = []
    cur = origin
    while remaining:
        best_i = 0
        best_d = float("inf")
        for i, task in enumerate(remaining):
            payload = task.payload if isinstance(task.payload, dict) else {}
            stop = slot_approach(
                payload.get("storage_row"), payload.get("storage_cell_x")
            )
            d = segment_length_m(cur, stop)
            if d < best_d:
                best_d = d
                best_i = i
        chosen = remaining.pop(best_i)
        ordered.append(chosen)
        payload = chosen.payload if isinstance(chosen.payload, dict) else {}
        cur = slot_approach(payload.get("storage_row"), payload.get("storage_cell_x"))
    return ordered


def _task_stop(task: WarehouseTask) -> dict[str, float]:
    payload = task.payload if isinstance(task.payload, dict) else {}
    return slot_approach(payload.get("storage_row"), payload.get("storage_cell_x"))


def measure_per_order_route_m(
    order_tasks: dict[uuid.UUID, list[WarehouseTask]],
    *,
    start: dict[str, float] | None = None,
) -> float:
    """Сумма длин позаказных туров (каждый заказ — отдельный объезд)."""
    origin = start or dict(PACKING_POINT)
    total = 0.0
    for tasks in order_tasks.values():
        if not tasks:
            continue
        ordered = nearest_neighbor_order(tasks, start=origin)
        stops = [_task_stop(t) for t in ordered]
        total += tour_length_m(stops, start=origin)
    return total


def measure_wave_route_m(
    tasks: list[WarehouseTask], *, start: dict[str, float] | None = None
) -> float:
    origin = start or dict(PACKING_POINT)
    ordered = nearest_neighbor_order(tasks, start=origin)
    stops = [_task_stop(t) for t in ordered]
    return tour_length_m(stops, start=origin)


def _resolve_warehouse_id(
    session: Session, warehouse_id: uuid.UUID | None
) -> uuid.UUID:
    if warehouse_id is not None:
        wh = session.get(Warehouse, warehouse_id)
        if not wh:
            raise HTTPException(status_code=404, detail="Склад не найден")
        return warehouse_id
    wh = session.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if wh is None:
        wh = session.exec(select(Warehouse).order_by(col(Warehouse.created_at))).first()
    if wh is None:
        raise HTTPException(status_code=500, detail="Не настроен ни один склад")
    return wh.id


def _next_wave_code(session: Session, warehouse_id: uuid.UUID) -> str:
    prefix = f"W-{datetime.now(timezone.utc).strftime('%Y%m%d')}-"
    existing = list(
        session.exec(
            select(PickWave.code).where(
                PickWave.warehouse_id == warehouse_id,
                col(PickWave.code).like(f"{prefix}%"),
            )
        ).all()
    )
    n = len(existing) + 1
    return f"{prefix}{n:04d}"


def _order_carrier(session: Session, order: OutboundOrder) -> str | None:
    extra = order.extra if isinstance(order.extra, dict) else {}
    for key in ("carrier", "carrier_code", "transport"):
        raw = extra.get(key)
        if raw:
            return str(raw).strip().lower()
    if order.shipment_id:
        shipment = session.get(Shipment, order.shipment_id)
        if shipment and isinstance(shipment.extra, dict):
            for key in ("carrier", "carrier_code", "transport"):
                raw = shipment.extra.get(key)
                if raw:
                    return str(raw).strip().lower()
    return None


def _filter_orders(
    session: Session,
    orders: list[OutboundOrder],
    criteria: dict[str, Any] | None,
) -> list[OutboundOrder]:
    if not criteria:
        return orders
    out = list(orders)
    carrier = criteria.get("carrier") or criteria.get("carrier_code")
    if carrier:
        want = str(carrier).strip().lower()
        out = [o for o in out if _order_carrier(session, o) == want]
    ship_by_before = criteria.get("ship_by_before")
    if ship_by_before:
        try:
            before = datetime.fromisoformat(str(ship_by_before).replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(
                status_code=400, detail="criteria.ship_by_before: неверный ISO datetime"
            ) from exc
        if before.tzinfo is None:
            before = before.replace(tzinfo=timezone.utc)
        filtered: list[OutboundOrder] = []
        for o in out:
            if o.ship_by_at is None:
                continue
            due = o.ship_by_at
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            if due <= before:
                filtered.append(o)
        out = filtered
    zone = criteria.get("zone") or criteria.get("zone_code")
    if zone:
        # Фильтр по зоне применяется после планирования в plan_wave (max по задачам).
        pass
    return out


def create_wave(
    session: Session,
    *,
    warehouse_id: uuid.UUID | None,
    order_ids: list[uuid.UUID],
    mode: str = "batch",
    code: str | None = None,
    criteria: dict[str, Any] | None = None,
    require_feature: bool = True,
) -> PickWave:
    """Создаёт волну (draft) и связи с заказами. Не коммитит."""
    if require_feature:
        ensure_wave_feature(session)
    mode_norm = (mode or "batch").strip().lower()
    if mode_norm not in WAVE_MODES:
        raise HTTPException(
            status_code=400, detail=f"mode: ожидается batch|zone, получено {mode!r}"
        )
    wid = _resolve_warehouse_id(session, warehouse_id)
    unique_ids = list(dict.fromkeys(order_ids))
    orders: list[OutboundOrder] = []
    for oid in unique_ids:
        order = session.get(OutboundOrder, oid)
        if order is None:
            raise HTTPException(status_code=404, detail=f"Заказ {oid} не найден")
        if order.warehouse_id != wid:
            raise HTTPException(
                status_code=400,
                detail=f"Заказ {order.code} относится к другому складу",
            )
        orders.append(order)
    orders = _filter_orders(session, orders, criteria)
    if not orders:
        raise HTTPException(
            status_code=400, detail="После применения criteria не осталось заказов"
        )

    now = datetime.now(timezone.utc)
    wave_code = (code or "").strip() or _next_wave_code(session, wid)
    clash = session.exec(
        select(PickWave).where(PickWave.warehouse_id == wid, PickWave.code == wave_code)
    ).first()
    if clash:
        raise HTTPException(
            status_code=409, detail=f"Волна с кодом {wave_code!r} уже существует"
        )

    wave = PickWave(
        warehouse_id=wid,
        code=wave_code,
        status="draft",
        mode=mode_norm,
        criteria=criteria,
        created_at=now,
        updated_at=now,
    )
    session.add(wave)
    session.flush()
    for order in orders:
        session.add(
            PickWaveOrder(
                wave_id=wave.id,
                outbound_order_id=order.id,
                created_at=now,
            )
        )
    session.flush()
    return wave


def _wave_orders(session: Session, wave_id: uuid.UUID) -> list[OutboundOrder]:
    links = list(
        session.exec(
            select(PickWaveOrder).where(PickWaveOrder.wave_id == wave_id)
        ).all()
    )
    orders: list[OutboundOrder] = []
    for link in links:
        order = session.get(OutboundOrder, link.outbound_order_id)
        if order is not None:
            orders.append(order)
    return orders


def _wave_pick_tasks(
    session: Session, wave: PickWave, orders: list[OutboundOrder]
) -> list[WarehouseTask]:
    tasks: list[WarehouseTask] = []
    for order in orders:
        for task in related_tasks(session, order):
            if task.task_type != "pick":
                continue
            tasks.append(task)
    # Также задачи, уже помеченные wave_id (на случай повторного plan).
    tagged = list(
        session.exec(
            select(WarehouseTask).where(
                WarehouseTask.warehouse_id == wave.warehouse_id,
                WarehouseTask.task_type == "pick",
            )
        ).all()
    )
    seen = {t.id for t in tasks}
    for task in tagged:
        payload = task.payload if isinstance(task.payload, dict) else {}
        if str(payload.get("wave_id") or "") == str(wave.id) and task.id not in seen:
            tasks.append(task)
            seen.add(task.id)
    return tasks


def plan_wave(
    session: Session,
    wave: PickWave,
    *,
    require_feature: bool = True,
) -> dict[str, Any]:
    """
    Планирует pick по заказам волны, сортирует маршрут NN, пишет wave_seq.

    Не коммитит. Возвращает метрики длины пути до/после объединения.
    """
    if require_feature:
        ensure_wave_feature(session)
    if wave.status not in WAVE_STATUSES_PLANABLE:
        raise HTTPException(
            status_code=400,
            detail=f"Волна в статусе {wave.status!r} не планируется",
        )
    orders = _wave_orders(session, wave.id)
    if not orders:
        raise HTTPException(status_code=400, detail="В волне нет заказов")

    created_total = 0
    for order in orders:
        stats = plan_outbound_picks(session, order)
        created_total += int(stats.get("created") or 0)

    tasks = _wave_pick_tasks(session, wave, orders)
    criteria = wave.criteria if isinstance(wave.criteria, dict) else {}
    zone_filter = criteria.get("zone") or criteria.get("zone_code")
    if zone_filter:
        zwant = str(zone_filter).strip().upper()
        if not zwant.startswith("B") and zwant.isdigit():
            zwant = f"B{int(zwant):02d}"

        def _task_zone(task: WarehouseTask) -> str:
            payload = task.payload if isinstance(task.payload, dict) else {}
            return zone_code_for_row(payload.get("storage_row"))

        tasks = [t for t in tasks if _task_zone(t) == zwant]

    max_tasks = criteria.get("max_tasks")
    if max_tasks is not None:
        try:
            limit = int(max_tasks)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=400, detail="criteria.max_tasks: целое число"
            ) from exc
        if limit > 0:
            tasks = tasks[:limit]

    if not tasks:
        raise HTTPException(
            status_code=400, detail="Нет pick-задач для построения маршрута волны"
        )

    by_order: dict[uuid.UUID, list[WarehouseTask]] = {}
    for task in tasks:
        payload = task.payload if isinstance(task.payload, dict) else {}
        raw = payload.get("order_id")
        try:
            oid = uuid.UUID(str(raw)) if raw else uuid.UUID(int=0)
        except ValueError:
            oid = uuid.UUID(int=0)
        by_order.setdefault(oid, []).append(task)

    per_order_m = measure_per_order_route_m(by_order)
    ordered = nearest_neighbor_order(tasks)
    wave_m = tour_length_m([_task_stop(t) for t in ordered])

    now = datetime.now(timezone.utc)
    for seq, task in enumerate(ordered, start=1):
        payload = dict(task.payload) if isinstance(task.payload, dict) else {}
        row = payload.get("storage_row")
        try:
            row_i = int(row) if row is not None else None
        except (TypeError, ValueError):
            row_i = None
        payload["wave_id"] = str(wave.id)
        payload["wave_code"] = wave.code
        payload["wave_seq"] = seq
        payload["zone_code"] = zone_code_for_row(row_i)
        payload["planned_via"] = "outbound_wave"
        task.payload = payload
        task.updated_at = now
        session.add(task)

    extra = dict(wave.extra) if isinstance(wave.extra, dict) else {}
    extra["route_length_per_order_m"] = round(per_order_m, 3)
    extra["route_length_wave_m"] = round(wave_m, 3)
    extra["route_savings_m"] = round(max(0.0, per_order_m - wave_m), 3)
    extra["planned_at"] = now.isoformat()
    extra["task_count"] = len(ordered)

    wave.route_length_m = round(wave_m, 3)
    wave.extra = extra
    wave.status = "planned"
    wave.updated_at = now
    session.add(wave)
    session.flush()

    return {
        "created_tasks": created_total,
        "route_length_m": round(wave_m, 3),
        "route_length_per_order_m": round(per_order_m, 3),
        "savings_m": round(max(0.0, per_order_m - wave_m), 3),
        "task_ids": [t.id for t in ordered],
    }


def assign_zones(
    session: Session,
    wave: PickWave,
    assignments: list[dict[str, Any]],
    *,
    require_feature: bool = True,
) -> list[PickWaveZoneAssignment]:
    """Закрепляет зоны за операторами и проставляет assigned_user_id на pick."""
    if require_feature:
        ensure_wave_feature(session)
    if wave.mode != "zone" and wave.mode != "batch":
        raise HTTPException(status_code=400, detail="Некорректный mode волны")
    # Зонный режим: разрешаем assign и для batch (переводим в zone).
    if wave.mode != "zone":
        wave.mode = "zone"

    now = datetime.now(timezone.utc)
    result: list[PickWaveZoneAssignment] = []
    for item in assignments:
        zone_code = str(item.get("zone_code") or "").strip().upper()
        user_id = item.get("assigned_user_id")
        if not zone_code:
            raise HTTPException(status_code=400, detail="zone_code обязателен")
        if user_id is None:
            raise HTTPException(status_code=400, detail="assigned_user_id обязателен")
        try:
            uid = uuid.UUID(str(user_id))
        except ValueError as exc:
            raise HTTPException(
                status_code=400, detail="assigned_user_id: неверный UUID"
            ) from exc

        row = session.exec(
            select(PickWaveZoneAssignment).where(
                PickWaveZoneAssignment.wave_id == wave.id,
                PickWaveZoneAssignment.zone_code == zone_code,
            )
        ).first()
        if row is None:
            row = PickWaveZoneAssignment(
                wave_id=wave.id,
                zone_code=zone_code,
                assigned_user_id=uid,
                created_at=now,
                updated_at=now,
            )
        else:
            row.assigned_user_id = uid
            row.updated_at = now
        session.add(row)
        result.append(row)

    session.flush()
    orders = _wave_orders(session, wave.id)
    tasks = _wave_pick_tasks(session, wave, orders)
    zone_to_user = {r.zone_code: r.assigned_user_id for r in result}
    for task in tasks:
        payload = dict(task.payload) if isinstance(task.payload, dict) else {}
        zc = str(payload.get("zone_code") or "").strip().upper()
        if not zc:
            zc = zone_code_for_row(payload.get("storage_row"))
            payload["zone_code"] = zc
            task.payload = payload
        if zc in zone_to_user and zone_to_user[zc] is not None:
            task.assigned_user_id = zone_to_user[zc]
            task.updated_at = now
            session.add(task)

    wave.updated_at = now
    if wave.status == "planned":
        wave.status = "released"
    session.add(wave)
    session.flush()
    return result


def wave_to_public(session: Session, wave: PickWave) -> dict[str, Any]:
    links = list(
        session.exec(
            select(PickWaveOrder).where(PickWaveOrder.wave_id == wave.id)
        ).all()
    )
    zones = list(
        session.exec(
            select(PickWaveZoneAssignment).where(
                PickWaveZoneAssignment.wave_id == wave.id
            )
        ).all()
    )
    orders = _wave_orders(session, wave.id)
    tasks = _wave_pick_tasks(session, wave, orders)
    wave_tasks = [
        t
        for t in tasks
        if isinstance(t.payload, dict)
        and str(t.payload.get("wave_id") or "") == str(wave.id)
    ]
    extra = wave.extra if isinstance(wave.extra, dict) else {}
    return {
        "id": wave.id,
        "warehouse_id": wave.warehouse_id,
        "code": wave.code,
        "status": wave.status,
        "mode": wave.mode,
        "criteria": wave.criteria,
        "route_length_m": wave.route_length_m,
        "route_length_per_order_m": extra.get("route_length_per_order_m"),
        "extra": wave.extra,
        "order_ids": [ln.outbound_order_id for ln in links],
        "zone_assignments": [
            {"zone_code": z.zone_code, "assigned_user_id": z.assigned_user_id}
            for z in zones
        ],
        "task_ids": [
            t.id
            for t in sorted(
                wave_tasks,
                key=lambda t: int(
                    (t.payload or {}).get("wave_seq") or 0
                    if isinstance(t.payload, dict)
                    else 0
                ),
            )
        ],
        "created_at": wave.created_at,
        "updated_at": wave.updated_at,
    }


__all__ = [
    "FEATURE_OUTBOUND_WAVE",
    "assign_zones",
    "create_wave",
    "enable_wave_feature_for_tests",
    "ensure_wave_feature",
    "measure_per_order_route_m",
    "measure_wave_route_m",
    "nearest_neighbor_order",
    "plan_wave",
    "slot_approach",
    "tour_length_m",
    "wave_to_public",
    "zone_code_for_row",
]
