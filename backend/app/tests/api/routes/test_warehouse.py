from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import (
    LAYOUT_LIFECYCLE_PUBLISHED,
    Warehouse,
    WarehouseLayout,
    WarehouseSlotOccupancy,
)


def test_warehouse_layout_schema_and_lifecycle(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/warehouse/layout",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["lifecycle_status"] == "published"
    assert data["spec_schema_version"] == 1
    assert data["spec"]["schema_version"] == 1
    assert data["spec"]["rows"] == 12
    assert data["spec"]["cellX"] == 20


def test_warehouse_route_graph(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/warehouse/route-graph",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert "warehouse_layout_id" in body
    assert "nodes" in body and "edges" in body
    assert body["counts"]["nodes"] >= 0
    assert body["counts"]["edges"] >= 0


def test_fork_draft_increments_version(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    cur = client.get(
        f"{settings.API_V1_STR}/warehouse/layout",
        headers=superuser_token_headers,
    )
    assert cur.status_code == 200
    v0 = cur.json()["version"]
    fr = client.post(
        f"{settings.API_V1_STR}/warehouse/layout/fork-draft",
        headers=superuser_token_headers,
        json={},
    )
    assert fr.status_code == 200
    data = fr.json()
    assert data["lifecycle_status"] == "draft"
    assert data["version"] == v0 + 1
    assert data["is_active"] is False


def test_topology_sync_route_graph(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    sync = client.post(
        f"{settings.API_V1_STR}/warehouse/topology/sync-route-graph",
        headers=superuser_token_headers,
        json={},
    )
    assert sync.status_code == 200
    s = sync.json()
    assert s["nodes_created"] >= 2
    rg = client.get(
        f"{settings.API_V1_STR}/warehouse/route-graph",
        headers=superuser_token_headers,
    )
    assert rg.status_code == 200
    assert rg.json()["counts"]["nodes"] == s["nodes_created"]


def test_activate_layout_sets_warehouse_active_pointer(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    layout1 = db.exec(
        select(WarehouseLayout).where(WarehouseLayout.is_active.is_(True))
    ).first()
    wh = db.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    assert layout1 is not None and wh is not None
    layout2 = WarehouseLayout(
        code=layout1.code,
        version=layout1.version + 500,
        is_active=False,
        spec=layout1.spec,
        spec_schema_version=layout1.spec_schema_version,
        lifecycle_status=LAYOUT_LIFECYCLE_PUBLISHED,
        published_at=datetime.now(timezone.utc),
        warehouse_id=layout1.warehouse_id,
    )
    db.add(layout2)
    db.commit()
    db.refresh(layout2)
    r = client.post(
        f"{settings.API_V1_STR}/warehouse/layout/{layout2.id}/activate",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    db.refresh(wh)
    assert wh.active_layout_id == layout2.id


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
