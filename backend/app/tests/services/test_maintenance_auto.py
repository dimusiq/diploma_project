"""P3-19: авто-ТО по моточасам и простой в KPI."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlmodel import Session, select

from app.models import (
    WORK_ORDER_STATUS_DONE,
    Notification,
    Warehouse,
    WarehouseTask,
    WorkOrder,
)
from app.services.maintenance_auto import sync_overdue_maintenance
from app.services.task_device_assignment import assign_warehouse_task_device
from app.services.warehouse_kpi import (
    compute_warehouse_kpis,
    plan_fact_ratio,
    work_order_downtime_hours,
)
from app.tests.utils.user import create_random_user
from app.warehouse_sim.fleet import demo_warehouse
from app.warehouse_sim.models import DEVICE_FORKLIFT, DEVICE_STATUS_IDLE, SimDevice


def _device_with_hours(db: Session, *, hours: int) -> SimDevice:
    wh = demo_warehouse(db)
    assert wh is not None
    suffix = uuid.uuid4().hex[:8]
    device = SimDevice(
        warehouse_id=wh.id,
        code=f"fl-auto-{suffix}",
        name=f"FL-AUTO-{suffix}",
        device_type=DEVICE_FORKLIFT,
        status=DEVICE_STATUS_IDLE,
        x=1.0,
        y=1.0,
        home_x=1.0,
        home_y=1.0,
        speed_mps=2.0,
        meta={"kind": "forklift", "engineHours": hours},
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


def test_overdue_hours_creates_work_order_and_notification(db: Session) -> None:
    user = create_random_user(db)
    device = _device_with_hours(db, hours=500)

    stats = sync_overdue_maintenance(
        db, actor_user_id=user.id, notify_user_id=user.id
    )
    db.commit()

    assert stats["overdue"] >= 1
    assert stats["work_orders_created"] >= 1
    assert stats["notifications_created"] >= 1

    wo = db.exec(
        select(WorkOrder).where(WorkOrder.equipment_id == device.id)
    ).first()
    assert wo is not None
    assert wo.status == "open"
    assert wo.description and "auto_to:" in wo.description

    note = db.exec(
        select(Notification).where(
            Notification.user_id == user.id,
            Notification.entity_id == device.id,
            Notification.type == "overdue_maintenance",
        )
    ).first()
    assert note is not None

    # идемпотентность
    stats2 = sync_overdue_maintenance(
        db, actor_user_id=user.id, notify_user_id=user.id
    )
    db.commit()
    assert stats2["work_orders_created"] == 0
    assert stats2["notifications_created"] == 0


def test_downtime_counted_in_kpi(db: Session) -> None:
    device = _device_with_hours(db, hours=100)
    start = datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc)
    end = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)
    wo = WorkOrder(
        equipment_id=device.id,
        title="Ремонт гидравлики",
        status=WORK_ORDER_STATUS_DONE,
        start_at=start,
        end_at=end,
        created_at=start,
        updated_at=end,
    )
    db.add(wo)
    db.commit()

    assert work_order_downtime_hours(start, end) == 4.0

    snap = compute_warehouse_kpis(
        db,
        from_date=date(2026, 9, 1),
        to_date=date(2026, 9, 30),
    )
    assert snap.equipment_downtime_hours is not None
    assert snap.equipment_downtime_hours >= 4.0
    assert any(
        b.reason.startswith("Ремонт") for b in snap.equipment_downtime_by_reason
    )


def test_assign_task_to_device(db: Session) -> None:
    device = _device_with_hours(db, hours=10)
    wh = db.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if wh is None:
        wh = Warehouse(code="default", name="Основной склад")
        db.add(wh)
        db.commit()
        db.refresh(wh)

    task = WarehouseTask(
        warehouse_id=wh.id,
        task_type="pick",
        status="pending",
        payload={"sku": "X"},
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    assign_warehouse_task_device(db, task, device.id)
    db.commit()
    db.refresh(task)
    assert task.payload is not None
    assert task.payload.get("assigned_device_id") == str(device.id)
    assert task.payload.get("assigned_device_code") == device.code


def test_plan_fact_ratio_unit() -> None:
    assert plan_fact_ratio(10.0, 5.0) == 2.0
    assert plan_fact_ratio(5.0, 5.0) == 1.0
    assert plan_fact_ratio(1.0, 0) is None
