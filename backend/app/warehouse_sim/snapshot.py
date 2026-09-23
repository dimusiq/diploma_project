"""Снимки состояния для API и SSE (контракт совпадает с фронтенд-панелями)."""

from __future__ import annotations

from datetime import datetime, timezone

from app.warehouse_sim.layout import ZONE_PACKING, ZONE_RECEIVING, ZONE_SHIPPING
from app.warehouse_sim.traffic import current_speed
from app.warehouse_sim.world import DAY_START_SEC


def clone_device(device: dict) -> dict:
    return {
        **device,
        "pos": dict(device["pos"]),
        "homePos": dict(device["homePos"]),
        "path": [],
        "history": list(device.get("history") or []),
    }


def build_motion(world: dict, running: bool, version: int) -> dict:
    rack_fill = [
        {"rackId": rack["id"], "occupied": 0, "total": rack["bays"] * rack["levels"]}
        for rack in world["topology"]["racks"]
    ]
    index = {row["rackId"]: i for i, row in enumerate(rack_fill)}
    for cell in world["cells"]:
        if cell["palletId"] is None:
            continue
        i = index.get(cell["rackId"])
        if i is not None:
            rack_fill[i]["occupied"] += 1
    zone_pallets = {ZONE_RECEIVING: 0, ZONE_PACKING: 0, ZONE_SHIPPING: 0}
    for pallet in world["pallets"].values():
        if pallet["locationKind"] != "zone":
            continue
        if pallet["locationId"] in zone_pallets:
            zone_pallets[pallet["locationId"]] += 1
    return {
        "version": version,
        "timeSec": world["timeSec"],
        "running": running,
        "devices": [
            {
                "id": d["id"],
                "kind": d["kind"],
                "name": d["name"],
                "status": d["status"],
                "x": d["pos"]["x"],
                "z": d["pos"]["z"],
                "battery": d["battery"],
                "alarm": d["alarm"],
                "online": d["online"],
                "carrying": d.get("palletId") is not None,
                "speed": round(current_speed(d), 2),
                "targetSpeed": float(d.get("speed") or 0.0),
                "waitingFor": d.get("waitingFor"),
                "waitingSeconds": round(float(d.get("waitingDuration") or 0.0), 2),
            }
            for d in world["devices"]
        ],
        "workers": [
            {
                "id": w["id"],
                "code": w.get("code"),
                "name": w["name"],
                "x": w["pos"]["x"],
                "z": w["pos"]["z"],
                "heading": float(w.get("heading") or 0.0),
                "speed": float(w.get("speed") or 0.0) if w.get("status") == "walking" else 0.0,
                "status": w.get("status"),
                "target": w.get("target"),
                "currentZone": w.get("current_zone"),
                "employeeCode": w.get("employeeCode"),
                "workerId": w.get("workerId"),
                "displayName": w.get("displayName"),
                "positionTitle": w.get("positionTitle"),
                "shift": w.get("shift"),
            }
            for w in world["workers"]
            if w.get("pos")
        ],
        "trucks": [
            {
                "id": t["id"],
                "plate": t["plate"],
                "direction": t["direction"],
                "x": t["pos"]["x"],
                "z": t["pos"]["z"],
                "docked": t["status"] == "docked",
            }
            for t in world["trucks"]
        ],
        "rackFill": rack_fill,
        "zonePallets": zone_pallets,
    }


def build_data(world: dict, state: str, speed: float, version: int) -> dict:
    occupied = sum(1 for c in world["cells"] if c["palletId"] is not None)
    event_counts = sorted(
        ({"type": k, "count": v} for k, v in world["eventCountsByType"].items()),
        key=lambda row: -row["count"],
    )[:14]
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "version": version,
        "timeSec": world["timeSec"],
        "dayStartSec": world.get("dayStartSec", DAY_START_SEC),
        "realTime": now,
        "state": state,
        "running": state == "RUNNING",
        "speed": speed,
        "scenario": world.get("scenario", "NORMAL_OPERATION"),
        "config": dict(world["config"]),
        "topology": world["topology"],
        "devices": [clone_device(d) for d in world["devices"]],
        "trucks": [{**t, "pos": dict(t["pos"])} for t in world["trucks"]],
        "inbound": [dict(i) for i in world["inbound"][-40:]],
        "outbound": [
            {**o, "lines": [dict(ln) for ln in o["lines"]], "palletIds": list(o["palletIds"])}
            for o in world["outbound"][-60:]
        ],
        "tasks": [
            {**t, "from": dict(t["from"]), "to": dict(t["to"])} for t in world["tasks"]
        ],
        "workers": [dict(w) for w in world["workers"]],
        "events": list(world["events"][:200]),
        "metrics": dict(world["metrics"]),
        "cellsTotal": len(world["cells"]),
        "cellsOccupied": occupied,
        "occupiedCellIds": [c["id"] for c in world["cells"] if c.get("palletId")],
        "palletsTotal": len(world["pallets"]),
        "eventCounts": event_counts,
        "skuLabels": {s["id"]: s["code"] for s in world["skus"]},
        "kpi": build_kpi(world, state),
    }


def build_kpi(world: dict, state: str) -> dict:
    devices = world["devices"]
    active_devices = sum(1 for d in devices if d["online"] and d["status"] not in ("offline",))
    active_tasks = sum(1 for t in world["tasks"] if t["status"] in ("pending", "assigned", "in_progress"))
    errors = sum(1 for e in world["events"][:80] if e["severity"] == "error")
    warnings = sum(1 for e in world["events"][:80] if e["severity"] == "warning")
    inbound_trucks = sum(1 for t in world["trucks"] if t["direction"] == "inbound")
    outbound_trucks = sum(1 for t in world["trucks"] if t["direction"] == "outbound")
    events_per_min = 0.0
    if world["timeSec"] > 1:
        events_per_min = world["metrics"]["eventsTotal"] / (world["timeSec"] / 60.0)
    return {
        "state": state,
        "activeDevices": active_devices,
        "activeTasks": active_tasks,
        "orders": len([o for o in world["outbound"] if o["status"] != "shipped"]),
        "inventoryItems": len(world["pallets"]),
        "inboundTrucks": inbound_trucks,
        "outboundShipments": outbound_trucks + world["metrics"]["ordersShipped"],
        "eventsPerMin": round(events_per_min, 2),
        "errors": errors,
        "warnings": warnings,
        "faults": world["metrics"]["faults"],
    }
