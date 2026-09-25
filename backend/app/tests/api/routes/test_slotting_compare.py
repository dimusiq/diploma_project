"""POST slotting-compare не создаёт задания; execute pending не двигает координаты товара."""

import json
import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, func, select

from app import crud
from app.agent.tool_safety import AgentToolContext
from app.core.config import settings
from app.models import Item, Warehouse, WarehouseTask
from app.services.agent_tools_handlers import handle_create_transfer_task


def test_slotting_compare_returns_three_kpis_without_tasks(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    before = db.exec(select(func.count()).select_from(WarehouseTask)).one()
    response = client.post(
        f"{settings.API_V1_STR}/warehouse/simulation/slotting-compare",
        headers=superuser_token_headers,
        json={
            "duration_hours": 1,
            "seed": 3,
            "dock_bays": 1,
            "num_forklifts": 1,
            "num_operators": 1,
            "truck_arrival_rate_per_hour": 0.5,
            "pick_orders_per_hour": 1,
            "replenishment_trips_per_hour": 0.2,
            "putaway_rule": "round_robin",
            "layout_travel_scale": 3.5,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["random"]["putaway_rule"] == "random"
    assert body["nearest"]["putaway_rule"] == "nearest"
    assert body["ai"]["putaway_rule"] == "nearest"
    assert body["nearest"]["layout_travel_scale"] == 1.0
    for name in ("random", "nearest", "ai"):
        policy = body[name]
        assert policy["kpis"] is not None
        assert "max_dock_queue" in policy["kpis"]
        assert "mean_pick_path_proxy_min" in policy["kpis"]
        assert "raw_path_ratio" in policy
        assert 0.25 <= policy["layout_travel_scale"] <= 4.0
    db.expire_all()
    after = db.exec(select(func.count()).select_from(WarehouseTask)).one()
    assert before == after


def test_execute_pending_transfer_creates_task_without_moving_stock(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
    monkeypatch: object,
) -> None:
    monkeypatch.setattr(settings, "AGENT_SANDBOX_MODE", False)  # type: ignore[attr-defined]
    user = crud.get_user_by_email(session=db, email=settings.FIRST_SUPERUSER)
    assert user is not None
    warehouse = db.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if warehouse is None:
        warehouse = Warehouse(code="default", name="Основной склад")
        db.add(warehouse)
        db.commit()
    item = Item(
        title="slotting-exec",
        owner_id=user.id,
        status="warehouse",
        quantity=1,
        storage_row=2,
        storage_level=1,
        storage_cell_x=1,
        storage_cell_z=1,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    ctx = AgentToolContext(
        run_id=str(uuid.uuid4()),
        actor_user_id=user.id,
        sandbox=False,
        allow_mutating_tools=True,
        is_superuser=True,
    )
    rejected = json.loads(
        handle_create_transfer_task(
            db,
            user,
            {"task_type": "move", "item_id": str(item.id), "slot_key": "not-a-key"},
            ctx,
        )
    )
    assert "error" in rejected
    db.expire_all()
    stored = db.get(Item, item.id)
    assert stored is not None
    assert stored.storage_row == 2

    created = client.post(
        f"{settings.API_V1_STR}/agent/pending-actions",
        headers=superuser_token_headers,
        json={
            "tool_name": "create_transfer_task",
            "arguments": {
                "task_type": "move",
                "item_id": str(item.id),
                "slot_key": "",
                "priority": 0,
                "note": "slotting test",
            },
            "rationale": "slotting",
        },
    )
    assert created.status_code == 200, created.text
    pending_id = created.json()["id"]
    executed = client.post(
        f"{settings.API_V1_STR}/agent/pending-actions/{pending_id}/execute",
        headers=superuser_token_headers,
    )
    assert executed.status_code == 200, executed.text
    assert executed.json()["status"] == "executed"
    db.expire_all()
    stored = db.get(Item, item.id)
    assert stored is not None
    assert stored.storage_row == 2
    matched = [
        task
        for task in db.exec(select(WarehouseTask)).all()
        if isinstance(task.payload, dict) and task.payload.get("item_id") == str(item.id)
    ]
    assert len(matched) == 1
