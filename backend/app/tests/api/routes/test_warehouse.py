from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import WarehouseSlotOccupancy


def test_warehouse_occupancy_requires_auth(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/warehouse/occupancy")
    assert r.status_code in (401, 403)


def test_warehouse_occupancy_after_item_with_cell(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    body = {
        "title": "Slot proj test",
        "quantity": 1,
        "storage_row": 1,
        "storage_level": 1,
        "storage_cell_x": 1,
        "storage_cell_z": 1,
    }
    cr = client.post(
        f"{settings.API_V1_STR}/items/",
        headers=superuser_token_headers,
        json=body,
    )
    assert cr.status_code == 200
    item_id = cr.json()["id"]

    oc = client.get(
        f"{settings.API_V1_STR}/warehouse/occupancy",
        headers=superuser_token_headers,
    )
    assert oc.status_code == 200
    data = oc.json()["data"]
    keys = {e["slot_key"] for e in data}
    assert "0-0-0-0" in keys
    assert any(e["item_id"] == item_id for e in data)

    row = db.exec(select(WarehouseSlotOccupancy).where(WarehouseSlotOccupancy.item_id == item_id)).first()
    assert row is not None
    assert row.slot_key == "0-0-0-0"


def test_warehouse_occupancy_clears_when_storage_cleared(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    body = {
        "title": "Clear cell test",
        "quantity": 1,
        "storage_row": 2,
        "storage_level": 2,
        "storage_cell_x": 2,
        "storage_cell_z": 1,
    }
    cr = client.post(
        f"{settings.API_V1_STR}/items/",
        headers=superuser_token_headers,
        json=body,
    )
    assert cr.status_code == 200
    item_id = cr.json()["id"]

    up = client.put(
        f"{settings.API_V1_STR}/items/{item_id}",
        headers=superuser_token_headers,
        json={
            "storage_row": None,
            "storage_level": None,
            "storage_cell_x": None,
            "storage_cell_z": None,
        },
    )
    assert up.status_code == 200

    row = db.exec(select(WarehouseSlotOccupancy).where(WarehouseSlotOccupancy.item_id == item_id)).first()
    assert row is None
