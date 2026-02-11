"""Роли и проверки прав: кто видит чужие items, кто может менять статус."""

from app.models import User
from app.models import (
    ROLE_ADMIN,
    ROLE_MANAGER,
    ROLE_VIEWER,
    ROLE_WAREHOUSE,
)


def _role_name(user: User) -> str | None:
    if user.role is None:
        return None
    return user.role.name


def can_see_all_items(user: User) -> bool:
    """Видеть все товары (не только свои)."""
    if user.is_superuser:
        return True
    role = _role_name(user)
    return role in (ROLE_ADMIN, ROLE_MANAGER, ROLE_WAREHOUSE)


def can_change_status(user: User) -> bool:
    """Менять статус товара (incoming/warehouse/shipment)."""
    if user.is_superuser:
        return True
    role = _role_name(user)
    return role in (ROLE_ADMIN, ROLE_MANAGER, ROLE_WAREHOUSE)


def can_manage_users(user: User) -> bool:
    """Управление пользователями (список, создание, редактирование)."""
    if user.is_superuser:
        return True
    return _role_name(user) == ROLE_ADMIN
