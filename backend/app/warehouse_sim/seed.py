"""Первичное заполнение таблиц wsim_*: план, устройства, SKU, сценарии."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.warehouse_sim.layout import (
    ZONE_STORAGE as LAYOUT_STORAGE,
    build_cells,
    build_topology,
)
from app.warehouse_sim.models import (
    DEVICE_AGV,
    DEVICE_AMR,
    DEVICE_CHARGING_STATION,
    DEVICE_CONVEYOR,
    DEVICE_DOCK,
    DEVICE_FORKLIFT,
    DEVICE_SCANNER,
    DEVICE_SENSOR,
    DEVICE_STATUS_IDLE,
    DEVICE_STATUS_ONLINE,
    DOCK_RECEIVING,
    DOCK_SHIPPING,
    ZONE_CHARGING,
    ZONE_PACKING,
    ZONE_PICKING,
    ZONE_RECEIVING,
    ZONE_SHIPPING,
    ZONE_STORAGE,
    SimAisle,
    SimDevice,
    SimDock,
    SimProduct,
    SimRack,
    SimScenario,
    SimStorageLocation,
    SimWarehouse,
    SimZone,
)
from app.warehouse_sim.scenarios import SCENARIO_DEFS
from app.warehouse_sim.world import SKUS, create_world

logger = logging.getLogger(__name__)

KIND_TO_TYPE = {
    "receiving": ZONE_RECEIVING,
    "storage": ZONE_STORAGE,
    "picking": ZONE_PICKING,
    "packing": ZONE_PACKING,
    "shipping": ZONE_SHIPPING,
    "charging": ZONE_CHARGING,
}
DEVICE_KIND_TO_TYPE = {
    "agv": DEVICE_AGV,
    "amr": DEVICE_AMR,
    "forklift": DEVICE_FORKLIFT,
    "scanner": DEVICE_SCANNER,
    "sensor": DEVICE_SENSOR,
    "conveyor": DEVICE_CONVEYOR,
    "dock_door": DEVICE_DOCK,
    "charger": DEVICE_CHARGING_STATION,
}


def seed_if_empty(session: Session) -> None:
    existing = session.exec(select(SimWarehouse).where(SimWarehouse.code == "DEMO")).first()
    if existing is None:
        _seed_warehouse(session)
        logger.info("Warehouse Device Server: seeded DEMO layout")
    _seed_products(session)
    _seed_scenarios(session)
    from app.warehouse_sim.fleet import ensure_fleet_seed

    ensure_fleet_seed(session)
    session.commit()


def _seed_products(session: Session) -> None:
    have = {p.sku for p in session.exec(select(SimProduct)).all()}
    for sku in SKUS:
        if sku["code"] in have:
            continue
        session.add(
            SimProduct(
                sku=sku["code"],
                name=sku["name"],
                units_per_pallet=sku["unitsPerPallet"],
                cold_chain=bool(sku["cold"]),
            )
        )


def _seed_scenarios(session: Session) -> None:
    have = {s.code for s in session.exec(select(SimScenario)).all()}
    for i, spec in enumerate(SCENARIO_DEFS):
        if spec["code"] in have:
            continue
        session.add(
            SimScenario(
                code=spec["code"],
                name=spec["name"],
                description=spec["description"],
                config=spec.get("config") or {},
                is_builtin=True,
                sort_order=i,
            )
        )


def _seed_warehouse(session: Session) -> None:
    now = datetime.now(timezone.utc)
    topology = build_topology()
    world = create_world()
    wh = SimWarehouse(
        code="DEMO",
        name="Демо-склад Device Server",
        width_m=topology["width"],
        height_m=topology["depth"],
        grid_cell_m=1.0,
        created_at=now,
        updated_at=now,
    )
    session.add(wh)
    session.flush()

    zone_rows: dict[str, SimZone] = {}
    for zone in topology["zones"]:
        row = SimZone(
            warehouse_id=wh.id,
            code=zone["code"],
            name=zone["name"],
            zone_type=KIND_TO_TYPE.get(zone["kind"], ZONE_STORAGE),
            x=zone["x"],
            y=zone["z"],
            width=zone["w"],
            height=zone["d"],
        )
        session.add(row)
        session.flush()
        zone_rows[zone["id"]] = row

    storage_zone = zone_rows.get(LAYOUT_STORAGE)
    for i, z in enumerate(topology["aisleZ"]):
        session.add(
            SimAisle(
                warehouse_id=wh.id,
                zone_id=storage_zone.id if storage_zone else None,
                code=f"A-H-{i + 1}",
                name=f"Поперечный проезд {i + 1}",
                orientation="horizontal",
                axis_coord=z,
                from_coord=22,
                to_coord=78,
                width_m=3.0,
            )
        )
    for i, x in enumerate(topology["corridorX"]):
        session.add(
            SimAisle(
                warehouse_id=wh.id,
                zone_id=storage_zone.id if storage_zone else None,
                code=f"A-V-{i + 1}",
                name=f"Продольный коридор {i + 1}",
                orientation="vertical",
                axis_coord=x,
                from_coord=2,
                to_coord=62,
                width_m=3.5,
            )
        )

    cells = build_cells(topology["racks"])
    for rack in topology["racks"]:
        zone = zone_rows.get(rack["zoneId"])
        row = SimRack(
            warehouse_id=wh.id,
            zone_id=zone.id if zone else None,
            code=rack["code"],
            name=f"Стеллаж {rack['code']}",
            x=rack["x"],
            y=rack["z"],
            width=rack["w"],
            height=rack["d"],
            bays=rack["bays"],
            levels=rack["levels"],
        )
        session.add(row)
        session.flush()
        for cell in cells:
            if cell["rackId"] != rack["id"]:
                continue
            session.add(
                SimStorageLocation(
                    warehouse_id=wh.id,
                    rack_id=row.id,
                    code=cell["id"],
                    bay=cell["bay"],
                    level=cell["level"],
                    capacity=1,
                    occupied=0,
                    approach_x=cell["pos"]["x"],
                    approach_y=cell["pos"]["z"],
                )
            )

    for dock in topology["docks"]:
        zid = zone_rows["zone-recv"].id if dock["direction"] == "inbound" else zone_rows["zone-ship"].id
        session.add(
            SimDock(
                warehouse_id=wh.id,
                zone_id=zid,
                code=dock["code"],
                dock_type=DOCK_RECEIVING if dock["direction"] == "inbound" else DOCK_SHIPPING,
                x=dock["pos"]["x"],
                y=dock["pos"]["z"],
                yard_x=dock["yardPos"]["x"],
                yard_y=dock["yardPos"]["z"],
            )
        )

    for device in world["devices"]:
        dtype = DEVICE_KIND_TO_TYPE.get(device["kind"])
        if not dtype:
            continue
        session.add(
            SimDevice(
                **{
                    "warehouse_id": wh.id,
                    "code": device["id"][:64],
                    "name": device["name"][:64],
                    "device_type": dtype,
                    "enabled": True,
                    "archived": False,
                    "status": DEVICE_STATUS_IDLE if device["status"] == "idle" else DEVICE_STATUS_ONLINE,
                    "battery": device["battery"],
                    "x": device["pos"]["x"],
                    "y": device["pos"]["z"],
                    "home_x": device["homePos"]["x"],
                    "home_y": device["homePos"]["z"],
                    "speed_mps": float(device["speed"] or 0),
                    "meta": {
                        k: device[k]
                        for k in (
                            "kind",
                            "zoneId",
                            "metricKind",
                            "metricUnit",
                            "metricMin",
                            "metricMax",
                            "metric",
                            "health",
                            "status",
                        )
                        if device.get(k) is not None
                    },
                }
            )
        )
