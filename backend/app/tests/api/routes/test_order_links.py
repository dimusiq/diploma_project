import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import AuditLog, Warehouse, WarehouseTask


def _warehouse(db: Session) -> Warehouse:
    row = db.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if row:
        return row
    row = Warehouse(code="default", name="Основной склад")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_sim_id_resolves_to_wms_order_and_equipment(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    wh = _warehouse(db)
    code = f"agv-{uuid.uuid4().hex[:6]}"
    device = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/fleet",
        headers=superuser_token_headers,
        json={"kind": "agv", "code": code, "name": f"AGV {code}"},
    )
    assert device.status_code == 200, device.text

    sim_id = f"so-{uuid.uuid4().hex[:8]}"
    created = client.post(
        f"{settings.API_V1_STR}/outbound-orders/",
        headers=superuser_token_headers,
        json={
            "code": f"OUT-LINK-{uuid.uuid4().hex[:8]}",
            "status": "picking",
            "extra": {"customer": "Клиент", "sim_id": sim_id},
            "lines": {"items": [{"skuId": "SKU-LINK", "pallets": 1, "picked": 0}]},
        },
    )
    assert created.status_code == 200, created.text
    order_id = created.json()["id"]

    db.add(
        WarehouseTask(
            warehouse_id=wh.id,
            task_type="pick",
            status="in_progress",
            payload={
                "sim_order_id": sim_id,
                "device_id": code,
                "source": "STOR",
                "destination": "PACK",
            },
        )
    )
    db.commit()

    resolved = client.get(
        f"{settings.API_V1_STR}/outbound-orders/resolve",
        headers=superuser_token_headers,
        params={"sim_id": sim_id},
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["id"] == order_id

    by_uuid = client.get(
        f"{settings.API_V1_STR}/outbound-orders/resolve",
        headers=superuser_token_headers,
        params={"sim_id": order_id},
    )
    assert by_uuid.status_code == 200
    assert by_uuid.json()["id"] == order_id

    detail = client.get(
        f"{settings.API_V1_STR}/outbound-orders/{order_id}/fulfillment",
        headers=superuser_token_headers,
    )
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert any(row["code"] == code for row in body["equipment"])
    assert any(row["task_type"] == "pick" for row in body["tasks"])


def test_simulation_pause_is_audited(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    response = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/control",
        headers=superuser_token_headers,
        json={"action": "pause"},
    )
    assert response.status_code == 200, response.text
    db.expire_all()
    row = db.exec(
        select(AuditLog)
        .where(AuditLog.action == "simulation.pause")
        .order_by(AuditLog.created_at.desc())
    ).first()
    assert row is not None
    assert row.user_id is not None
    assert row.resource_type == "warehouse_sim"
    assert row.created_at is not None


def test_work_order_create_is_audited(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    code = f"agv-wo-{uuid.uuid4().hex[:6]}"
    device = client.post(
        f"{settings.API_V1_STR}/warehouse-sim/fleet",
        headers=superuser_token_headers,
        json={"kind": "agv", "code": code, "name": f"AGV {code}"},
    )
    assert device.status_code == 200, device.text
    created = client.post(
        f"{settings.API_V1_STR}/work-orders/",
        headers=superuser_token_headers,
        json={"equipment_id": device.json()["id"], "title": f"ТО {code}"},
    )
    assert created.status_code == 200, created.text
    db.expire_all()
    row = db.exec(
        select(AuditLog)
        .where(AuditLog.action == "work_order.create")
        .where(AuditLog.resource_id == uuid.UUID(created.json()["id"]))
    ).first()
    assert row is not None
    assert row.user_id is not None
    assert row.resource_type == "work_order"
