"""integration_inbox → домен + outbox → проекции."""

from sqlmodel import Session, select

from app.core.config import settings
from app.events import catalog
from app.models import (
    IntegrationInbox,
    Item,
    TwinProjectionEntry,
    TwinQueueDepthProjection,
    User,
    Warehouse,
    WarehouseSlotOccupancy,
)
from app.services.integration_inbox_processor import process_integration_inbox_batch
from app.services.outbox_dispatch import process_outbox_batch


def _drain_outbox(db: Session) -> None:
    while True:
        batch = process_outbox_batch(db, limit=200)
        db.commit()
        if batch["batch_taken"] == 0:
            break


def test_inbox_putaway_updates_item_slot_and_projections(db: Session) -> None:
    user = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
    wh = db.exec(select(Warehouse)).first()
    assert user is not None and wh is not None

    item = Item(title="inbox-domain-test", owner_id=user.id, status="incoming", quantity=1)
    db.add(item)
    db.commit()
    db.refresh(item)

    inbox = IntegrationInbox(
        source="test-wms",
        event_type="wms.putaway.complete",
        payload={
            "schema_version": 1,
            "item_id": str(item.id),
            "warehouse_id": str(wh.id),
            "slot_key": "0-0-0-0",
            "meta": {"item_status": "warehouse"},
        },
        status="pending",
    )
    db.add(inbox)
    db.commit()

    stats = process_integration_inbox_batch(db, limit=10)
    assert stats["processed"] >= 1

    db.refresh(item)
    assert item.storage_row == 1
    assert item.storage_level == 1
    assert item.storage_cell_x == 1
    assert item.storage_cell_z == 1
    assert item.status == "warehouse"

    _drain_outbox(db)

    occ = db.exec(
        select(WarehouseSlotOccupancy).where(WarehouseSlotOccupancy.item_id == item.id)
    ).first()
    assert occ is not None

    tpe = db.exec(
        select(TwinProjectionEntry).where(
            TwinProjectionEntry.event_type == catalog.EVENT_INVENTORY_PUTAWAY_COMPLETED
        )
    ).first()
    assert tpe is not None


def test_inbox_unknown_event_marks_failed(db: Session) -> None:
    inbox = IntegrationInbox(
        source="test",
        event_type="unknown.event.type",
        payload={},
        status="pending",
    )
    db.add(inbox)
    db.commit()
    iid = inbox.id

    stats = process_integration_inbox_batch(db, limit=10)
    assert stats["failed"] >= 1

    row = db.get(IntegrationInbox, iid)
    assert row is not None
    assert row.status == "failed"
    assert row.processing_error


def test_inbox_queue_depth_projection(db: Session) -> None:
    wh = db.exec(select(Warehouse)).first()
    assert wh is not None

    inbox = IntegrationInbox(
        source="test-wms",
        event_type="wms.queue.depth",
        payload={
            "schema_version": 1,
            "warehouse_id": str(wh.id),
            "queue_name": "dock_inbound",
            "depth": 7,
        },
        status="pending",
    )
    db.add(inbox)
    db.commit()

    stats = process_integration_inbox_batch(db, limit=10)
    assert stats["processed"] >= 1

    _drain_outbox(db)

    q = db.exec(
        select(TwinQueueDepthProjection).where(
            TwinQueueDepthProjection.warehouse_id == wh.id,
            TwinQueueDepthProjection.queue_name == "dock_inbound",
        )
    ).first()
    assert q is not None
    assert q.depth == 7


def test_inbox_telemetry_only_no_domain_event(db: Session) -> None:
    inbox = IntegrationInbox(
        source="edge",
        event_type="integration.telemetry",
        payload={"temperature_c": 21.5},
        status="pending",
    )
    db.add(inbox)
    db.commit()
    iid = inbox.id

    stats = process_integration_inbox_batch(db, limit=10)
    assert stats["twin_only"] >= 1

    row = db.get(IntegrationInbox, iid)
    assert row is not None
    assert row.status == "processed"
    assert row.domain_event_id is None
