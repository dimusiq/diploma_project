from fastapi import APIRouter

from app.api.routes import (
    audit,
    brands,
    categories,
    dashboard,
    equipment,
    items,
    login,
    maintenance_schedule,
    notifications,
    maintenance_templates,
    maintenance_calendar_events,
    private,
    roles,
    spare_parts,
    users,
    utils,
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


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
