"""Датчики симулятора."""

from __future__ import annotations

from app.warehouse_sim import events as ev
from app.warehouse_sim.rng import rand_chance, rand_normal, rand_range
from app.warehouse_sim.sim_common import (
    MAX_HISTORY,
    SENSOR_SAMPLE_SEC,
    SENSOR_SPIKE_CHANCE,
    emit,
)


def process_sensors(world: dict, dt: float) -> None:
    world["accumulators"]["sensorSample"] += dt
    if world["accumulators"]["sensorSample"] < SENSOR_SAMPLE_SEC:
        return
    world["accumulators"]["sensorSample"] = 0
    for device in world["devices"]:
        if (
            device["kind"] != "sensor"
            or not device["online"]
            or device["status"] == "fault"
        ):
            continue
        current = device["metric"] or 0
        if device["metricKind"] == "weight":
            value = max(0.0, rand_normal(world, 480, 220, 0, 1600))
        elif device["metricKind"] == "photo_eye":
            value = 1 if rand_chance(world, 0.35) else 0
        else:
            mn = device["metricMin"] or 0
            mx = device["metricMax"] or 1
            span = max(1e-6, mx - mn)
            setpoint = (mn + mx) / 2
            pull = (setpoint - current) * 0.12
            noise = rand_normal(world, 0, span * 0.02, -span * 0.08, span * 0.08)
            spike = (
                rand_range(world, -span * 0.95, span * 0.95)
                if rand_chance(world, SENSOR_SPIKE_CHANCE)
                else 0
            )
            value = current + pull + noise + spike
            if device["metricKind"] in ("vibration", "co2"):
                value = max(0.0, value)
        device["metric"] = round(value * 100) / 100
        device["history"].append(device["metric"])
        if len(device["history"]) > MAX_HISTORY:
            device["history"] = device["history"][-MAX_HISTORY:]
        below = (
            device["metricMin"] is not None and device["metric"] < device["metricMin"]
        )
        above = (
            device["metricMax"] is not None and device["metric"] > device["metricMax"]
        )
        if (below or above) and not device["alarm"]:
            device["alarm"] = True
            world["metrics"]["alarms"] += 1
            emit(
                world,
                ev.SENSOR_ALARM,
                "error" if device["metricKind"] == "temperature" else "warning",
                f"{device['name']}: выход за границы — {device['metric']}{device.get('metricUnit') or ''}",
                device_id=device["id"],
                zone_id=device.get("zoneId"),
            )
        elif not (below or above) and device["alarm"]:
            device["alarm"] = False
        if rand_chance(world, 0.08):
            emit(
                world,
                ev.SENSOR_READING,
                "info",
                f"{device['name']}: {device['metric']}{device.get('metricUnit') or ''}",
                device_id=device["id"],
            )
