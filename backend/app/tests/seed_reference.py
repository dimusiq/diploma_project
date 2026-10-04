"""Эталонные данные после TRUNCATE: права, layout, wsim DEMO, конфиг ТО."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlmodel import Session, col, select

from app.core.permissions import ALL_PERMISSION_CODES
from app.models import (
    LAYOUT_LIFECYCLE_PUBLISHED,
    ROLE_ADMIN,
    ROLE_MANAGER,
    ROLE_VIEWER,
    ROLE_WAREHOUSE,
    Permission,
    Role,
    RolePermission,
    Warehouse,
    WarehouseEmployee,
    WarehouseLayout,
)

# Описания прав (для seed; коды — из ALL_PERMISSION_CODES).
_PERM_DESCRIPTIONS: dict[str, str] = {
    "items.read_all": "Видеть все товары (не только свои)",
    "items.change_status": "Менять статус товара",
    "users.manage": "Управление пользователями",
    "roles.read": "Просмотр ролей",
    "categories.manage": "Управление категориями",
    "brands.manage": "Управление брендами техники",
    "zones.manage": "Управление зонами склада",
    "audit.read": "Просмотр журнала аудита",
    "maintenance_schedule.view": "Просмотр расписания ТО",
    "maintenance_schedule.edit": "Редактирование расписания ТО",
    "agent.use": "Использование чат-ассистента по складу",
    "warehouse.tasks.read": "Просмотр складских заданий (WMS)",
    "warehouse.tasks.manage": "Создание и изменение складских заданий",
    "warehouse.telemetry.ingest": "Запись телеметрии датчиков",
    "integrations.inbox.read": "Просмотр очереди входящих интеграций",
    "integrations.inbox.write": "Приём событий во входящую очередь",
    "agent.policies.read": "Просмотр политик ассистента",
    "agent.policies.manage": "Изменение политик ассистента",
    "personnel.read": "Просмотр персонала склада",
    "personnel.write": "Изменение персонала склада",
}

# Сводка шаблонов из миграций e3… / b4… / n2… / p4… / u9… / dd4…
_ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    ROLE_ADMIN: frozenset(ALL_PERMISSION_CODES),
    ROLE_MANAGER: frozenset(
        {
            "items.read_all",
            "items.change_status",
            "maintenance_schedule.view",
            "maintenance_schedule.edit",
            "agent.use",
            "warehouse.tasks.read",
            "warehouse.tasks.manage",
            "warehouse.telemetry.ingest",
            "integrations.inbox.read",
            "agent.policies.read",
            "personnel.read",
            "personnel.write",
        }
    ),
    ROLE_WAREHOUSE: frozenset(
        {
            "items.read_all",
            "items.change_status",
            "maintenance_schedule.view",
            "agent.use",
            "warehouse.tasks.read",
            "agent.policies.read",
            "personnel.read",
        }
    ),
    ROLE_VIEWER: frozenset(
        {
            "maintenance_schedule.view",
            "agent.use",
        }
    ),
}

_DEFAULT_LAYOUT_ID = uuid.UUID("a0000001-0001-4000-8000-000000000001")
_DEFAULT_LAYOUT_SPEC: dict = {
    "schema_version": 1,
    "geometry": {
        "rows": 12,
        "levels": 4,
        "cellX": 20,
        "cellZ": 1,
        "coordinateSystem": "1-based",
        "cellKeyFormat": "zeroBasedDashSeparated",
    },
}


def seed_permissions(session: Session) -> None:
    """permission + role_permission по шаблонам ролей."""
    by_code: dict[str, Permission] = {
        p.code: p for p in session.exec(select(Permission)).all()
    }
    for code in ALL_PERMISSION_CODES:
        if code in by_code:
            continue
        row = Permission(
            id=uuid.uuid4(),
            code=code,
            description=_PERM_DESCRIPTIONS.get(code),
        )
        session.add(row)
        by_code[code] = row
    session.flush()

    roles = {r.name: r for r in session.exec(select(Role)).all()}
    existing = {
        (rp.role_id, rp.permission_id)
        for rp in session.exec(select(RolePermission)).all()
    }
    for role_name, codes in _ROLE_PERMISSIONS.items():
        role = roles.get(role_name)
        if role is None:
            continue
        for code in codes:
            perm = by_code.get(code)
            if perm is None:
                continue
            key = (role.id, perm.id)
            if key in existing:
                continue
            session.add(RolePermission(role_id=role.id, permission_id=perm.id))
            existing.add(key)
    session.commit()


def seed_warehouse_layout(session: Session) -> None:
    """Активный published layout + склад default (как в миграции l0m1…)."""
    now = datetime.now(timezone.utc)
    wh = session.exec(select(Warehouse).where(Warehouse.code == "default")).first()
    if wh is None:
        wh = Warehouse(code="default", name="Основной склад")
        session.add(wh)
        session.flush()

    layout = session.get(WarehouseLayout, _DEFAULT_LAYOUT_ID)
    if layout is None:
        layout = session.exec(
            select(WarehouseLayout).where(col(WarehouseLayout.is_active).is_(True))
        ).first()
    if layout is None:
        layout = WarehouseLayout(
            id=_DEFAULT_LAYOUT_ID,
            code="default",
            version=1,
            is_active=True,
            spec=dict(_DEFAULT_LAYOUT_SPEC),
            spec_schema_version=1,
            lifecycle_status=LAYOUT_LIFECYCLE_PUBLISHED,
            published_at=now,
            activated_at=now,
            warehouse_id=wh.id,
            created_at=now,
        )
        session.add(layout)
    else:
        layout.is_active = True
        layout.lifecycle_status = LAYOUT_LIFECYCLE_PUBLISHED
        if not layout.spec:
            layout.spec = dict(_DEFAULT_LAYOUT_SPEC)
        layout.warehouse_id = layout.warehouse_id or wh.id
        session.add(layout)
    session.flush()
    wh.active_layout_id = layout.id
    session.add(wh)
    session.commit()


def seed_maintenance_config(session: Session) -> None:
    """Ключи maintenance_schedule_config из миграции b4c5…."""
    from sqlalchemy import text

    session.execute(
        text(
            """
            INSERT INTO maintenance_schedule_config (key, value)
            VALUES
            ('default_intervals', '[500, 1000, 1500, 2000, 2500]'),
            ('default_remind_before_hours', '50')
            ON CONFLICT (key) DO NOTHING
            """
        )
    )
    session.commit()


def seed_wsim_demo(session: Session) -> None:
    """DEMO-склад Device Server (wsim_*), если пусто."""
    from app.warehouse_sim.seed import seed_if_empty

    seed_if_empty(session)


def seed_demo_employees(session: Session) -> None:
    """Три демо-сотрудника из миграции dd4e5f6a7b8c."""
    demo = [
        (
            uuid.UUID("11111111-1111-4111-8111-111111111001"),
            "EMP-001",
            "Иван",
            "Иванов",
            "Иванович",
            "Кладовщик",
        ),
        (
            uuid.UUID("11111111-1111-4111-8111-111111111002"),
            "EMP-002",
            "Алексей",
            "Петров",
            "Сергеевич",
            "Комплектовщик",
        ),
        (
            uuid.UUID("11111111-1111-4111-8111-111111111003"),
            "EMP-003",
            "Анна",
            "Сидорова",
            "Викторовна",
            "Контролёр",
        ),
    ]
    for emp_id, code, first, last, middle, position in demo:
        if session.get(WarehouseEmployee, emp_id) is not None:
            continue
        existing = session.exec(
            select(WarehouseEmployee).where(WarehouseEmployee.employee_code == code)
        ).first()
        if existing is not None:
            continue
        session.add(
            WarehouseEmployee(
                id=emp_id,
                employee_code=code,
                first_name=first,
                last_name=last,
                middle_name=middle,
                position=position,
                department="Склад №1",
                status="active",
                shift="day",
            )
        )
    session.commit()


def seed_all_reference(session: Session) -> None:
    """Полный набор справочников после TRUNCATE + init_db."""
    seed_permissions(session)
    seed_warehouse_layout(session)
    seed_maintenance_config(session)
    seed_demo_employees(session)
    seed_wsim_demo(session)
