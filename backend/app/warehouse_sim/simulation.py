"""Движок склада: тонкий оркестратор тика + обратная совместимость импортов.

Реализация разнесена по модулям:
sim_common, tasks, orders, movement, failures, sensors, conveyor, commands.
"""

from __future__ import annotations

from app.warehouse_sim.commands import (
    apply_command,
    device_command,
    emergency_stop,
    resume_all,
)
from app.warehouse_sim.conveyor import process_conveyors
from app.warehouse_sim.failures import (
    inject_fault,
    process_congestion,
    process_faults,
    repair_device,
)
from app.warehouse_sim.movement import (
    advance_along_path,
    complete_charge,
    drop_off_pallet,
    pick_up_pallet,
    process_devices,
    request_charge,
)
from app.warehouse_sim.orders import (
    process_docks,
    process_order_allocation,
    process_order_generation,
    process_packing,
    process_replenishment,
    process_shipping,
    process_truck_arrivals,
    spawn_inbound_truck,
    spawn_outbound_order,
    spawn_outbound_truck,
)
from app.warehouse_sim.pedestrians import advance_workers
from app.warehouse_sim.sensors import process_sensors
from app.warehouse_sim.sim_common import (
    CARRIERS,
    CUSTOMERS,
    MAX_DONE_TASKS,
    MAX_EVENTS,
    MAX_HISTORY,
    MAX_SUBSTEP_SEC,
    MOBILE_KINDS,
    REPLENISH_CHECK_SEC,
    SENSOR_SAMPLE_SEC,
    SENSOR_SPIKE_CHANCE,
    SHIFT_SEC,
    TASK_DEVICE_KINDS,
    TASK_LABELS,
    TASK_PRIORITY,
    TASKS_PER_TRUCK,
    dock_by_id,
    emit,
    find_free_cell,
    find_stock_cell,
    fire_scan,
    handling_time,
    is_mobile_kind,
    pick_worker,
    release_worker,
    sku_code,
    task_kind_label,
    trim_history,
)
from app.warehouse_sim.tasks import (
    abort_task,
    assign_tasks,
    create_task,
    finish_task,
    seed_demo_agv_task,
)
from app.warehouse_sim.traffic import find_task

__all__ = [
    "CARRIERS",
    "CUSTOMERS",
    "MAX_DONE_TASKS",
    "MAX_EVENTS",
    "MAX_HISTORY",
    "MAX_SUBSTEP_SEC",
    "MOBILE_KINDS",
    "REPLENISH_CHECK_SEC",
    "SENSOR_SAMPLE_SEC",
    "SENSOR_SPIKE_CHANCE",
    "SHIFT_SEC",
    "TASK_DEVICE_KINDS",
    "TASK_LABELS",
    "TASK_PRIORITY",
    "TASKS_PER_TRUCK",
    "abort_task",
    "advance_along_path",
    "advance_world",
    "apply_command",
    "assign_tasks",
    "complete_charge",
    "create_task",
    "device_command",
    "dock_by_id",
    "drop_off_pallet",
    "emergency_stop",
    "emit",
    "find_free_cell",
    "find_stock_cell",
    "find_task",
    "finish_task",
    "fire_scan",
    "handling_time",
    "inject_fault",
    "is_mobile_kind",
    "pick_up_pallet",
    "pick_worker",
    "process_congestion",
    "process_conveyors",
    "process_devices",
    "process_docks",
    "process_faults",
    "process_order_allocation",
    "process_order_generation",
    "process_packing",
    "process_replenishment",
    "process_sensors",
    "process_shipping",
    "process_truck_arrivals",
    "process_workers",
    "release_worker",
    "repair_device",
    "request_charge",
    "resume_all",
    "seed_demo_agv_task",
    "sku_code",
    "spawn_inbound_truck",
    "spawn_outbound_order",
    "spawn_outbound_truck",
    "step_world",
    "task_kind_label",
    "trim_history",
]


def process_workers(world: dict, dt: float) -> None:
    world["accumulators"]["shift"] += dt
    advance_workers(world, dt)
    from app.warehouse_sim.bracelets import apply_bracelet_positions
    from app.warehouse_sim.smart_cameras import apply_camera_positions

    apply_bracelet_positions(world)
    apply_camera_positions(world)
    for worker in world["workers"]:
        if worker["status"] == "break":
            worker["breakTimer"] -= dt
            if worker["breakTimer"] <= 0:
                worker["status"] = "idle"


def step_world(world: dict, dt: float) -> None:
    world["timeSec"] += dt
    process_truck_arrivals(world, dt)
    process_docks(world, dt)
    process_order_generation(world, dt)
    process_order_allocation(world)
    process_packing(world, dt)
    process_shipping(world)
    process_replenishment(world, dt)
    assign_tasks(world)
    process_devices(world, dt)
    process_faults(world, dt)
    process_conveyors(world, dt)
    process_sensors(world, dt)
    process_workers(world, dt)
    process_congestion(world, dt)
    trim_history(world)
    from app.warehouse_sim.vision.service import tick_cameras

    tick_cameras(world, dt)


def advance_world(world: dict, seconds: float) -> None:
    left = seconds
    while left > 0:
        step = min(MAX_SUBSTEP_SEC, left)
        step_world(world, step)
        left -= step
