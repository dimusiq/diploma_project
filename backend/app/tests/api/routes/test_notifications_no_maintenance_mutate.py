"""P1-7: чтение/ensure уведомлений не создаёт наряды ТО."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, col, func, select

from app.core.config import settings
from app.models import WorkOrder
from app.services.maintenance_auto import run_maintenance_auto_tick
from app.tests.services.test_maintenance_auto import _device_with_hours
from app.tests.utils.user import authentication_token_from_email


def _count_wo_for_device(db: Session, device_id: uuid.UUID) -> int:
    return int(
        db.exec(
            select(func.count())
            .select_from(WorkOrder)
            .where(WorkOrder.equipment_id == device_id)
        ).one()
    )


def test_get_notifications_does_not_create_work_orders(
    client: TestClient, db: Session
) -> None:
    device = _device_with_hours(db, hours=500)
    before = _count_wo_for_device(db, device.id)
    headers = authentication_token_from_email(
        client=client, email=settings.FIRST_SUPERUSER, db=db
    )
    r = client.get(f"{settings.API_V1_STR}/notifications/", headers=headers)
    assert r.status_code == 200
    db.expire_all()
    assert _count_wo_for_device(db, device.id) == before


def test_post_ensure_does_not_create_work_orders(
    client: TestClient, db: Session
) -> None:
    device = _device_with_hours(db, hours=500)
    before = _count_wo_for_device(db, device.id)
    headers = authentication_token_from_email(
        client=client, email=settings.FIRST_SUPERUSER, db=db
    )
    r = client.post(f"{settings.API_V1_STR}/notifications/ensure", headers=headers)
    assert r.status_code == 200
    db.expire_all()
    assert _count_wo_for_device(db, device.id) == before


def test_worker_tick_creates_work_order_idempotent(db: Session) -> None:
    device = _device_with_hours(db, hours=500)
    assert _count_wo_for_device(db, device.id) == 0

    stats = run_maintenance_auto_tick(db)
    assert stats["work_orders_created"] >= 1
    db.expire_all()
    assert _count_wo_for_device(db, device.id) >= 1

    stats2 = run_maintenance_auto_tick(db)
    assert stats2["work_orders_created"] == 0
    n = db.exec(
        select(func.count())
        .select_from(WorkOrder)
        .where(
            WorkOrder.equipment_id == device.id,
            col(WorkOrder.description).contains("auto_to:"),
        )
    ).one()
    assert int(n) == 1
