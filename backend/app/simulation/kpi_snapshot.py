"""Снимок KPI: данные из БД + заготовки под связку с DES (очереди, пути — из симуляции)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, extract, func
from sqlmodel import Session, col, select

from app.core.permissions import can_read_audit, can_see_all_items
from app.models import (
    DomainEvent,
    Item,
    User,
    WarehouseLayout,
    WarehouseRack,
    WarehouseZone,
)
from app.services.warehouse_twin_metrics import build_twin_summary_dict


def build_kpi_snapshot(session: Session, user: User) -> dict:
    """
    Baseline KPI по правам пользователя.
    Метрики «операционного контура» (очереди доков, длина пути отбора, replen latency)
    в снимке помечены как simulation_only — их даёт run_discrete_event_simulation.
    """
    see_all = can_see_all_items(session, user)
    twin = build_twin_summary_dict(session, user)

    layout = session.exec(
        select(WarehouseLayout).where(WarehouseLayout.is_active.is_(True))
    ).first()
    wh_id = layout.warehouse_id if layout else None

    occupancy_by_zone: list[dict[str, object]] = []
    if wh_id is not None:
        z_stmt = (
            select(WarehouseZone.name, func.count(Item.id))  # type: ignore[arg-type]
            .select_from(Item)
            .join(
                WarehouseRack,
                and_(
                    WarehouseRack.row_index == Item.storage_row,
                    WarehouseRack.warehouse_id == wh_id,
                    WarehouseRack.zone_id.is_not(None),
                ),
            )
            .join(WarehouseZone, WarehouseZone.id == WarehouseRack.zone_id)  # type: ignore[arg-type]
            .where(Item.status == "warehouse")
            .where(col(Item.storage_row).is_not(None))
        )
        if not see_all:
            z_stmt = z_stmt.where(Item.owner_id == user.id)
        z_stmt = z_stmt.group_by(WarehouseZone.name).order_by(WarehouseZone.name)
        for name, n in session.exec(z_stmt).all():
            occupancy_by_zone.append({"zone_name": str(name), "item_count": int(n)})

    slot_stmt = (
        select(Item.storage_level, func.count())  # type: ignore[arg-type]
        .where(Item.status == "warehouse")
        .where(col(Item.storage_level).is_not(None))
    )
    if not see_all:
        slot_stmt = slot_stmt.where(Item.owner_id == user.id)
    slot_stmt = slot_stmt.group_by(Item.storage_level).order_by(Item.storage_level)
    occupancy_by_slot_level: list[dict[str, object]] = []
    for lvl, n in session.exec(slot_stmt).all():
        if lvl is None:
            continue
        kind = "pick_face" if int(lvl) == 1 else "reserve"
        occupancy_by_slot_level.append(
            {"storage_level": int(lvl), "slot_kind": kind, "item_count": int(n)}
        )

    dwell_stmt = select(
        func.avg(extract("epoch", func.now() - Item.created_at))  # type: ignore[arg-type]
    ).where(Item.status == "warehouse")
    if not see_all:
        dwell_stmt = dwell_stmt.where(Item.owner_id == user.id)
    dwell_sec = session.exec(dwell_stmt).one()
    mean_dwell_days: float | None = None
    if dwell_sec is not None:
        mean_dwell_days = round(float(dwell_sec) / 86400.0, 3)

    total_wh = int(twin["warehouse_items_total"])
    expiring = int(twin["items_expiring_within_30_days"])
    near_expiry_ratio: float | None = None
    if total_wh > 0:
        near_expiry_ratio = round(expiring / total_wh, 4)

    stock_accuracy_proxy: float | None = None
    if can_read_audit(session, user):
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        adj_stmt = (
            select(func.count())
            .select_from(DomainEvent)
            .where(DomainEvent.occurred_at >= cutoff)
            .where(DomainEvent.event_type == "inventory.adjusted")
        )
        cnt_stmt = (
            select(func.count())
            .select_from(DomainEvent)
            .where(DomainEvent.occurred_at >= cutoff)
            .where(DomainEvent.event_type == "inventory.counted")
        )
        n_adj = int(session.exec(adj_stmt).one())
        n_cnt = int(session.exec(cnt_stmt).one())
        denom = n_adj + n_cnt
        if denom > 0:
            stock_accuracy_proxy = round(max(0.0, min(1.0, 1.0 - n_adj / denom)), 4)

    return {
        "twin_summary": twin,
        "occupancy_by_zone": occupancy_by_zone,
        "occupancy_by_row": twin["warehouse_items_by_row"],
        "occupancy_by_slot_level": occupancy_by_slot_level,
        "mean_dwell_days_warehouse": mean_dwell_days,
        "near_expiry_items_30d": expiring,
        "near_expiry_ratio": near_expiry_ratio,
        "stock_accuracy_proxy": stock_accuracy_proxy,
        "simulation_only_kpis": {
            "dock_turnaround_min": "DES: mean_dock_turnaround_min",
            "pick_path_length": "DES proxy: mean_pick_path_proxy_min (длительность отбора)",
            "replenishment_latency": "DES: mean_replenishment_cycle_min",
            "queue_depths": "DES: max_dock_queue, max_putaway_queue, max_pick_queue",
            "otif_sla": "DES: otif_proxy, late_pick_fraction",
            "operator_equipment_util": "DES: forklift_utilization, operator_utilization, dock_utilization",
        },
    }
