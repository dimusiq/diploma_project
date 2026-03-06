"""Гранулярные права: проверка по коду права и шаблонам ролей (role_permission)."""

from sqlmodel import Session, select

from app.models import Permission, RolePermission, User


# Коды прав (должны совпадать с seed в миграции)
PERM_ITEMS_READ_ALL = "items.read_all"
PERM_ITEMS_CHANGE_STATUS = "items.change_status"
PERM_USERS_MANAGE = "users.manage"
PERM_ROLES_READ = "roles.read"
PERM_CATEGORIES_MANAGE = "categories.manage"
PERM_BRANDS_MANAGE = "brands.manage"
PERM_ZONES_MANAGE = "zones.manage"
PERM_AUDIT_READ = "audit.read"
PERM_MAINTENANCE_SCHEDULE_VIEW = "maintenance_schedule.view"
PERM_MAINTENANCE_SCHEDULE_EDIT = "maintenance_schedule.edit"

ALL_PERMISSION_CODES = [
    PERM_ITEMS_READ_ALL,
    PERM_ITEMS_CHANGE_STATUS,
    PERM_USERS_MANAGE,
    PERM_ROLES_READ,
    PERM_CATEGORIES_MANAGE,
    PERM_BRANDS_MANAGE,
    PERM_ZONES_MANAGE,
    PERM_AUDIT_READ,
    PERM_MAINTENANCE_SCHEDULE_VIEW,
    PERM_MAINTENANCE_SCHEDULE_EDIT,
]


def get_user_permission_codes(session: Session, user: User) -> set[str]:
    """Набор кодов прав пользователя (роль → role_permission → permission.code). Суперпользователь не получает автоматически все коды — проверка в user_has_permission."""
    if user.is_superuser:
        return set(ALL_PERMISSION_CODES)
    if user.role_id is None:
        return set()
    stmt = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == user.role_id)
    )
    return {row for row in session.exec(stmt)}


def user_has_permission(session: Session, user: User, permission_code: str) -> bool:
    """Есть ли у пользователя право с данным кодом (суперпользователь = все права)."""
    if user.is_superuser:
        return True
    codes = get_user_permission_codes(session, user)
    return permission_code in codes


def can_see_all_items(session: Session, user: User) -> bool:
    """Видеть все товары (не только свои)."""
    return user_has_permission(session, user, PERM_ITEMS_READ_ALL)


def can_change_status(session: Session, user: User) -> bool:
    """Менять статус товара (incoming/warehouse/shipment)."""
    return user_has_permission(session, user, PERM_ITEMS_CHANGE_STATUS)


def can_manage_users(session: Session, user: User) -> bool:
    """Управление пользователями (список, создание, редактирование)."""
    return user_has_permission(session, user, PERM_USERS_MANAGE)


def can_read_roles(session: Session, user: User) -> bool:
    """Просмотр списка ролей."""
    return user_has_permission(session, user, PERM_ROLES_READ)


def can_manage_categories(session: Session, user: User) -> bool:
    """Управление категориями."""
    return user_has_permission(session, user, PERM_CATEGORIES_MANAGE)


def can_manage_brands(session: Session, user: User) -> bool:
    """Управление брендами."""
    return user_has_permission(session, user, PERM_BRANDS_MANAGE)


def can_manage_zones(session: Session, user: User) -> bool:
    """Управление зонами склада."""
    return user_has_permission(session, user, PERM_ZONES_MANAGE)


def can_read_audit(session: Session, user: User) -> bool:
    """Просмотр журнала аудита."""
    return user_has_permission(session, user, PERM_AUDIT_READ)


def can_view_maintenance_schedule(session: Session, user: User) -> bool:
    """Просмотр расписания ТО (цепочки, интервалы)."""
    return user_has_permission(session, user, PERM_MAINTENANCE_SCHEDULE_VIEW)


def can_edit_maintenance_schedule(session: Session, user: User) -> bool:
    """Редактирование расписания ТО (создание/изменение/удаление цепочек)."""
    return user_has_permission(session, user, PERM_MAINTENANCE_SCHEDULE_EDIT)
