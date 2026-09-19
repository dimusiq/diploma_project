import uuid

from app.models import OutboundOrder, WarehouseTask
from app.services.outbound_fulfillment import (
    is_ready_for_shipment,
    line_metrics,
    packing_complete,
    parse_line_items,
    picking_complete,
)


def test_parse_line_items_from_items_array() -> None:
    lines = {
        "customer": "ООО Ромашка",
        "items": [
            {"skuId": "SKU-1", "pallets": 2, "picked": 2},
            {"skuId": "SKU-2", "pallets": 1, "picked": 1},
        ],
    }
    rows = parse_line_items(lines)
    assert len(rows) == 2
    items_count, quantity, pallets = line_metrics(lines)
    assert items_count == 2
    assert pallets == 3
    assert quantity == 3


def test_packed_without_open_picks_is_ready() -> None:
    order = OutboundOrder(
        warehouse_id=uuid.uuid4(),
        code="OUT-READY",
        status="packed",
        lines={"items": [{"skuId": "A", "pallets": 1}]},
    )
    assert is_ready_for_shipment(order, []) is True


def test_open_and_picking_are_not_ready() -> None:
    wid = uuid.uuid4()
    open_order = OutboundOrder(warehouse_id=wid, code="OUT-OPEN", status="open")
    picking = OutboundOrder(warehouse_id=wid, code="OUT-PICK", status="picking")
    shipped = OutboundOrder(warehouse_id=wid, code="OUT-SHIP", status="shipped")
    assert is_ready_for_shipment(open_order, []) is False
    assert is_ready_for_shipment(picking, []) is False
    assert is_ready_for_shipment(shipped, []) is False


def test_packed_with_incomplete_pick_is_not_ready() -> None:
    wid = uuid.uuid4()
    order = OutboundOrder(warehouse_id=wid, code="OUT-WAIT", status="packed")
    task = WarehouseTask(
        warehouse_id=wid,
        task_type="pick",
        status="pending",
    )
    assert picking_complete(order, [task]) is False
    assert is_ready_for_shipment(order, [task]) is False


def test_packing_incomplete_until_packed() -> None:
    order = OutboundOrder(
        warehouse_id=uuid.uuid4(),
        code="OUT-PACKING",
        status="picking",
    )
    assert packing_complete(order) is False
    assert is_ready_for_shipment(order, []) is False
