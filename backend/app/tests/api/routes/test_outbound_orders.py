import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import OutboundOrder, Warehouse, WarehouseTask
from app.tests.utils.item import create_random_item


def _warehouse(db: Session) -> Warehouse:
    row = db.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if row:
        return row
    row = Warehouse(code="default", name="Основной склад")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _create_order(
    client: TestClient,
    headers: dict[str, str],
    *,
    code: str,
    status: str,
    extra: dict | None = None,
    lines: dict | None = None,
) -> dict:
    r = client.post(
        f"{settings.API_V1_STR}/outbound-orders/",
        headers=headers,
        json={
            "code": code,
            "status": status,
            "extra": extra or {"customer": "ООО Ромашка"},
            "lines": lines
            or {"items": [{"skuId": "SKU-OUT", "pallets": 2, "picked": 2}]},
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_ready_for_shipment_uses_packed_orders_not_item_status(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _warehouse(db)
    item = create_random_item(db)
    item.status = "shipment"
    db.add(item)
    db.commit()

    open_order = _create_order(
        client, superuser_token_headers, code=f"OUT-OPEN-{uuid.uuid4().hex[:8]}", status="open"
    )
    packed = _create_order(
        client,
        superuser_token_headers,
        code=f"OUT-PACK-{uuid.uuid4().hex[:8]}",
        status="packed",
    )
    shipped = _create_order(
        client,
        superuser_token_headers,
        code=f"OUT-SHIPPED-{uuid.uuid4().hex[:8]}",
        status="shipped",
    )
    picking = _create_order(
        client,
        superuser_token_headers,
        code=f"OUT-PICK-{uuid.uuid4().hex[:8]}",
        status="picking",
    )

    ready = client.get(
        f"{settings.API_V1_STR}/outbound-orders/ready-for-shipment",
        headers=superuser_token_headers,
    )
    assert ready.status_code == 200
    codes = {row["code"] for row in ready.json()["data"]}
    assert packed["code"] in codes
    assert open_order["code"] not in codes
    assert shipped["code"] not in codes
    assert picking["code"] not in codes
    assert ready.json()["ready_count"] >= 1


def test_incomplete_pick_task_excludes_packed_order(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    wh = _warehouse(db)
    sim_id = f"sim-{uuid.uuid4().hex[:8]}"
    packed = _create_order(
        client,
        superuser_token_headers,
        code=f"OUT-TASK-{uuid.uuid4().hex[:8]}",
        status="packed",
        extra={"customer": "Клиент", "sim_id": sim_id},
    )
    db.add(
        WarehouseTask(
            warehouse_id=wh.id,
            task_type="pick",
            status="pending",
            payload={"sim_order_id": sim_id},
        )
    )
    db.commit()
    ready = client.get(
        f"{settings.API_V1_STR}/outbound-orders/ready-for-shipment",
        headers=superuser_token_headers,
    )
    codes = {row["code"] for row in ready.json()["data"]}
    assert packed["code"] not in codes

    tasks = client.get(
        f"{settings.API_V1_STR}/warehouse/tasks",
        headers=superuser_token_headers,
    )
    assert tasks.status_code == 200
    assert tasks.json()["count"] >= 1


def test_ship_moves_order_to_shipped_board_and_rejects_second_ship(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _warehouse(db)
    sku = f"SKU-{uuid.uuid4().hex[:6]}"
    item = create_random_item(db)
    item.sku = sku
    item.status = "shipment"
    db.add(item)
    db.commit()
    packed = _create_order(
        client,
        superuser_token_headers,
        code=f"OUT-GO-{uuid.uuid4().hex[:8]}",
        status="packed",
        lines={"items": [{"skuId": sku, "pallets": 1, "picked": 1}]},
    )
    shipped = client.post(
        f"{settings.API_V1_STR}/outbound-orders/{packed['id']}/ship",
        headers=superuser_token_headers,
    )
    assert shipped.status_code == 200, shipped.text
    assert shipped.json()["status"] == "shipped"

    ready = client.get(
        f"{settings.API_V1_STR}/outbound-orders/ready-for-shipment",
        headers=superuser_token_headers,
    )
    assert packed["code"] not in {row["code"] for row in ready.json()["data"]}

    board = client.get(
        f"{settings.API_V1_STR}/outbound-orders/shipped-board",
        headers=superuser_token_headers,
    )
    assert packed["code"] in {row["code"] for row in board.json()["data"]}

    db.refresh(item)
    assert item.status == "shipped"

    again = client.post(
        f"{settings.API_V1_STR}/outbound-orders/{packed['id']}/ship",
        headers=superuser_token_headers,
    )
    assert again.status_code == 409


def test_cannot_ship_picking_order(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _warehouse(db)
    picking = _create_order(
        client,
        superuser_token_headers,
        code=f"OUT-NP-{uuid.uuid4().hex[:8]}",
        status="picking",
    )
    r = client.post(
        f"{settings.API_V1_STR}/outbound-orders/{picking['id']}/ship",
        headers=superuser_token_headers,
    )
    assert r.status_code == 400


def test_ship_forbidden_for_normal_user(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    _warehouse(db)
    packed = _create_order(
        client,
        superuser_token_headers,
        code=f"OUT-FORB-{uuid.uuid4().hex[:8]}",
        status="packed",
    )
    r = client.post(
        f"{settings.API_V1_STR}/outbound-orders/{packed['id']}/ship",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 403


def test_existing_outbound_list_still_works(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _warehouse(db)
    _create_order(
        client,
        superuser_token_headers,
        code=f"OUT-LIST-{uuid.uuid4().hex[:8]}",
        status="open",
    )
    r = client.get(
        f"{settings.API_V1_STR}/outbound-orders/",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    assert r.json()["count"] >= 1
