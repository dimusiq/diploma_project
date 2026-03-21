from fastapi import APIRouter

from app.api.routes import (
    agent,
    agent_knowledge,
    audit,
    brands,
    categories,
    dashboard,
    domain_events,
    equipment,
    equipment_telemetry,
    integrations,
    items,
    login,
    maintenance_calendar_events,
    maintenance_schedule,
    maintenance_templates,
    notifications,
    private,
    projections,
    roles,
    spare_parts,
    twin_stream,
    users,
    utils,
    warehouse_layout,
    warehouse_live,
    warehouse_simulation,
    warehouse_simulations,
    warehouse_tasks,
    warehouse_topology,
    warehouse_twin,
    work_orders,
    zones,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(roles.router)
api_router.include_router(utils.router)
api_router.include_router(categories.router)
api_router.include_router(brands.router)
api_router.include_router(zones.router)
api_router.include_router(warehouse_layout.router)
api_router.include_router(warehouse_topology.router)
api_router.include_router(warehouse_twin.router)
api_router.include_router(warehouse_simulation.router)
api_router.include_router(warehouse_simulations.router)
api_router.include_router(warehouse_live.router)
api_router.include_router(warehouse_tasks.router)
api_router.include_router(equipment_telemetry.router)
api_router.include_router(integrations.router)
api_router.include_router(items.router)
api_router.include_router(equipment.router)
api_router.include_router(maintenance_schedule.router)
api_router.include_router(maintenance_templates.router)
api_router.include_router(maintenance_calendar_events.router)
api_router.include_router(spare_parts.router)
api_router.include_router(work_orders.router)
api_router.include_router(dashboard.router)
api_router.include_router(notifications.router)
api_router.include_router(audit.router)
api_router.include_router(domain_events.router)
api_router.include_router(projections.router)
api_router.include_router(twin_stream.router)
api_router.include_router(agent.router)
api_router.include_router(agent_knowledge.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
