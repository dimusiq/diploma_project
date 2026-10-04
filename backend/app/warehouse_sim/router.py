"""HTTP API Warehouse Device Server.

Чтение live-состояния доступно любому авторизованному пользователю (Digital Twin).
Управление runtime — только ROLE_ADMIN или суперпользователь (Device Monitor).

Реализация: router_common / router_live / router_camera / router_fleet / router_control.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.warehouse_sim.router_camera import router as camera_router
from app.warehouse_sim.router_common import SimAdmin
from app.warehouse_sim.router_control import router as control_router
from app.warehouse_sim.router_fleet import router as fleet_router
from app.warehouse_sim.router_live import router as live_router

router = APIRouter(prefix="/warehouse-sim", tags=["warehouse-device-server"])
router.include_router(live_router)
router.include_router(camera_router)
router.include_router(fleet_router)
router.include_router(control_router)

__all__ = ["SimAdmin", "router"]

