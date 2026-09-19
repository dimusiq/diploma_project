from app.warehouse_sim.equipment_catalog import category_of
from app.warehouse_sim.fleet import baseline_devices
from app.warehouse_sim.simulation import advance_world, spawn_inbound_truck
from app.warehouse_sim.world import create_world


def test_baseline_park_composition() -> None:
    devices = baseline_devices()
    ids = [d["id"] for d in devices]
    assert len(devices) == 38
    assert ids == list(dict.fromkeys(ids))
    assert {"fl-1", "agv-1", "amr-1", "cnv-1", "dock-in-1", "scn-PACK", "chg-1"} <= set(ids)
    by_cat = {}
    for device in devices:
        by_cat.setdefault(category_of(device["kind"]), []).append(device["id"])
    assert set(by_cat["transport"]) >= {"fl-1", "agv-1", "amr-1"}
    assert "cnv-1" in by_cat["conveyor"]
    assert "dock-in-1" in by_cat["gate"]
    assert "scn-PACK" in by_cat["scanner"]
    assert "chg-1" in by_cat["charging"]
    assert any(code.startswith("sns-") for code in by_cat["sensor"])
    world = create_world(fleet=devices)
    assert [d["id"] for d in world["devices"]] == ids
    assert [d["name"] for d in world["devices"]] == [d["name"] for d in devices]


def test_disabled_device_is_not_assigned_new_tasks() -> None:
    world = create_world({"faultRatePerHour": 0, "jamRatePerHour": 0})
    for device in world["devices"]:
        if device["kind"] == "forklift":
            device["enabled"] = False
            device["online"] = True
            device["status"] = "idle"
            device["taskId"] = None
    spawn_inbound_truck(world)
    advance_world(world, 45)
    assert all(
        device.get("taskId") is None
        for device in world["devices"]
        if device["kind"] == "forklift"
    )
