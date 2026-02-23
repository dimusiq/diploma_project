from fastapi import APIRouter

from app.api.routes import (
    brands,
    categories,
    dashboard,
    equipment,
    items,
    login,
    private,
    roles,
    users,
    utils,
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
api_router.include_router(dashboard.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
