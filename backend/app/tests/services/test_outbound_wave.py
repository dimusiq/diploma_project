"""P2-8: волновой и зонный отбор — маршрут короче позаказного, зоны за операторами."""

from __future__ import annotations

import uuid

from sqlmodel import Session, col, select

from app.models import Item, OutboundOrder, Warehouse, WarehouseTask
from app.services.outbound_wave import (
    assign_zones,
    create_wave,
    enable_wave_feature_for_tests,
    measure_per_order_route_m,
    measure_wave_route_m,
    plan_wave,
    zone_code_for_row,
)
from app.tests.utils.item import create_random_item
from app.tests.utils.user import create_random_user


def _warehouse(db: Session) -> Warehouse:
    row = db.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if row:
        return row
    row = Warehouse(code="default", name="Основной склад")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _free_cell(db: Session, *, prefer_row: int, prefer_x: int) -> tuple[int, int, int]:
    try:
        db.rollback()
    except Exception:
        pass
    occupied = {
        (i.storage_row, i.storage_level, i.storage_cell_x)
        for i in db.exec(select(Item).where(col(Item.storage_row).is_not(None))).all()
        if i.storage_row and i.storage_level and i.storage_cell_x
    }
    if (prefer_row, 1, prefer_x) not in occupied:
        return prefer_row, 1, prefer_x
    for row in range(1, 17):
        for cell_x in range(1, 21):
            if (row, 1, cell_x) not in occupied:
                return row, 1, cell_x
    raise RuntimeError("нет свободной ячейки для теста")


def _stock_at(db: Session, *, sku: str, qty: int, row: int, cell_x: int) -> Item:
    r, level, x = _free_cell(db, prefer_row=row, prefer_x=cell_x)
    item = create_random_item(db)
    item.sku = sku
    item.quantity = qty
    item.reserved_quantity = 0
    item.status = "warehouse"
    item.storage_row = r
    item.storage_level = level
    item.storage_cell_x = x
    item.storage_cell_z = 1
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def test_ten_orders_one_wave_route_shorter_than_per_order(db: Session) -> None:
    """10 заказов → одна волна; суммарная длина пути меньше позаказной."""
    enable_wave_feature_for_tests(db)
    wh = _warehouse(db)
    suffix = uuid.uuid4().hex[:6]

    # Разнесённые ячейки: разные блоки стеллажей → позаказные туда-обратно дороже.
    placements = [
        (1, 1),
        (1, 12),
        (3, 2),
        (5, 10),
        (7, 1),
        (9, 12),
        (11, 3),
        (13, 11),
        (15, 2),
        (16, 12),
    ]
    order_ids: list[uuid.UUID] = []
    for i, (row, cell_x) in enumerate(placements):
        sku = f"WV-{suffix}-{i}"
        item = _stock_at(db, sku=sku, qty=5, row=row, cell_x=cell_x)
        order = OutboundOrder(
            warehouse_id=wh.id,
            code=f"OUT-WV-{suffix}-{i}",
            status="open",
            lines={"items": [{"skuId": item.sku, "quantity": 1}]},
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        order_ids.append(order.id)

    wave = create_wave(
        db,
        warehouse_id=wh.id,
        order_ids=order_ids,
        mode="batch",
        require_feature=True,
    )
    db.commit()
    db.refresh(wave)

    stats = plan_wave(db, wave)
    db.commit()
    db.refresh(wave)

    assert wave.status == "planned"
    assert stats["created_tasks"] == 10
    assert len(stats["task_ids"]) == 10
    assert stats["route_length_per_order_m"] > 0
    assert stats["route_length_m"] > 0
    assert stats["route_length_m"] < stats["route_length_per_order_m"]
    assert stats["savings_m"] == round(
        stats["route_length_per_order_m"] - stats["route_length_m"], 3
    )

    # wave_seq монотонен 1..N, zone_code проставлен.
    tasks = list(
        db.exec(
            select(WarehouseTask).where(
                WarehouseTask.warehouse_id == wh.id,
                WarehouseTask.task_type == "pick",
            )
        ).all()
    )
    wave_tasks = [
        t
        for t in tasks
        if isinstance(t.payload, dict) and t.payload.get("wave_id") == str(wave.id)
    ]
    assert len(wave_tasks) == 10
    seqs: list[int] = []
    for t in wave_tasks:
        assert isinstance(t.payload, dict)
        seqs.append(int(t.payload["wave_seq"]))
    assert sorted(seqs) == list(range(1, 11))
    assert all(
        isinstance(t.payload, dict) and t.payload.get("zone_code") for t in wave_tasks
    )

    # Независимый пересчёт «до/после» теми же функциями.
    by_order: dict[uuid.UUID, list[WarehouseTask]] = {}
    for t in wave_tasks:
        assert isinstance(t.payload, dict)
        oid = uuid.UUID(str(t.payload["order_id"]))
        by_order.setdefault(oid, []).append(t)
    per_m = measure_per_order_route_m(by_order)
    wave_m = measure_wave_route_m(wave_tasks)
    assert wave_m < per_m
    # Замер для отчёта: savings зафиксирован в stats волны.
    assert wave.extra is not None
    assert float(wave.extra["route_savings_m"]) > 0


def test_zone_picking_assigns_zones_to_operators(db: Session) -> None:
    """Зонный отбор закрепляет зоны B0x за разными операторами."""
    enable_wave_feature_for_tests(db)
    wh = _warehouse(db)
    suffix = uuid.uuid4().hex[:6]
    user_a = create_random_user(db)
    user_b = create_random_user(db)

    # Два блока: B01 (rows 1–2) и B04 (rows 7–8).
    specs = [
        (1, 2, "A"),
        (1, 8, "A"),
        (7, 3, "B"),
        (7, 9, "B"),
    ]
    order_ids: list[uuid.UUID] = []
    for i, (row, cell_x, _tag) in enumerate(specs):
        sku = f"ZN-{suffix}-{i}"
        item = _stock_at(db, sku=sku, qty=3, row=row, cell_x=cell_x)
        order = OutboundOrder(
            warehouse_id=wh.id,
            code=f"OUT-ZN-{suffix}-{i}",
            status="open",
            lines={"items": [{"skuId": item.sku, "quantity": 1}]},
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        order_ids.append(order.id)

    wave = create_wave(
        db,
        warehouse_id=wh.id,
        order_ids=order_ids,
        mode="zone",
        require_feature=True,
    )
    db.commit()
    stats = plan_wave(db, wave)
    db.commit()
    db.refresh(wave)
    assert stats["created_tasks"] == 4

    assign_zones(
        db,
        wave,
        [
            {"zone_code": "B01", "assigned_user_id": user_a.id},
            {"zone_code": "B04", "assigned_user_id": user_b.id},
        ],
    )
    db.commit()
    db.refresh(wave)
    assert wave.mode == "zone"
    assert wave.status == "released"

    tasks = list(
        db.exec(
            select(WarehouseTask).where(
                WarehouseTask.warehouse_id == wh.id,
                WarehouseTask.task_type == "pick",
            )
        ).all()
    )
    wave_tasks = [
        t
        for t in tasks
        if isinstance(t.payload, dict) and t.payload.get("wave_id") == str(wave.id)
    ]
    assert len(wave_tasks) == 4
    for t in wave_tasks:
        assert isinstance(t.payload, dict)
        zc = str(t.payload.get("zone_code"))
        assert zc in {"B01", "B04"}
        if zc == "B01":
            assert t.assigned_user_id == user_a.id
        else:
            assert t.assigned_user_id == user_b.id

    assert zone_code_for_row(1) == "B01"
    assert zone_code_for_row(7) == "B04"


def test_wave_disabled_without_feature_flag(db: Session) -> None:
    """Без флага create_wave → 409 (позаказный режим по умолчанию)."""
    from fastapi import HTTPException

    wh = _warehouse(db)
    # Гарантируем выключенный флаг.
    from app.models import FeatureFlag

    row = db.exec(
        select(FeatureFlag).where(FeatureFlag.key == "outbound_wave_picking")
    ).first()
    if row is not None:
        row.enabled = False
        db.add(row)
        db.commit()

    order = OutboundOrder(
        warehouse_id=wh.id,
        code=f"OUT-OFF-{uuid.uuid4().hex[:8]}",
        status="open",
        lines={"items": [{"skuId": "X", "quantity": 1}]},
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    try:
        create_wave(db, warehouse_id=wh.id, order_ids=[order.id])
        raise AssertionError("ожидался HTTPException 409")
    except HTTPException as exc:
        assert exc.status_code == 409
