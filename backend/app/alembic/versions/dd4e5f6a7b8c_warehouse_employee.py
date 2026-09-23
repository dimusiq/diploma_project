"""Справочник сотрудников склада и права personnel.read / personnel.write.

Revision ID: dd4e5f6a7b8c
Revises: cc3d4e5f6a7b
Create Date: 2026-09-23

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "dd4e5f6a7b8c"
down_revision = "cc3d4e5f6a7b"
branch_labels = None
depends_on = None

PERMISSION_CODES = [
    ("personnel.read", "Просмотр персонала склада"),
    ("personnel.write", "Изменение персонала склада"),
]

ROLE_PERMS = {
    "admin": ["personnel.read", "personnel.write"],
    "manager": ["personnel.read", "personnel.write"],
    "warehouse": ["personnel.read"],
}

DEMO_EMPLOYEES = [
    (
        "11111111-1111-4111-8111-111111111001",
        "EMP-001",
        "Иван",
        "Иванов",
        "Иванович",
        "Кладовщик",
    ),
    (
        "11111111-1111-4111-8111-111111111002",
        "EMP-002",
        "Алексей",
        "Петров",
        "Сергеевич",
        "Комплектовщик",
    ),
    (
        "11111111-1111-4111-8111-111111111003",
        "EMP-003",
        "Анна",
        "Сидорова",
        "Викторовна",
        "Контролёр",
    ),
]


def upgrade():
    op.create_table(
        "warehouse_employee",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_code", sa.String(length=32), nullable=False),
        sa.Column("first_name", sa.String(length=64), nullable=False),
        sa.Column("last_name", sa.String(length=64), nullable=False),
        sa.Column("middle_name", sa.String(length=64), nullable=True),
        sa.Column("position", sa.String(length=128), nullable=False),
        sa.Column("department", sa.String(length=128), nullable=False, server_default="Склад №1"),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("shift", sa.String(length=16), nullable=False, server_default="day"),
        sa.Column("hire_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_warehouse_employee_employee_code", "warehouse_employee", ["employee_code"], unique=True)
    op.create_index("ix_warehouse_employee_status", "warehouse_employee", ["status"])
    op.create_index("ix_warehouse_employee_shift", "warehouse_employee", ["shift"])

    conn = op.get_bind()
    for employee_id, code, first, last, middle, position in DEMO_EMPLOYEES:
        conn.execute(
            sa.text(
                """
                INSERT INTO warehouse_employee (
                    id, employee_code, first_name, last_name, middle_name,
                    position, department, status, shift
                ) VALUES (
                    :id, :code, :first_name, :last_name, :middle_name,
                    :position, 'Склад №1', 'active', 'day'
                )
                ON CONFLICT (employee_code) DO NOTHING
                """
            ),
            {
                "id": employee_id,
                "code": code,
                "first_name": first,
                "last_name": last,
                "middle_name": middle,
                "position": position,
            },
        )

    permission_ids = {}
    for code, desc in PERMISSION_CODES:
        pid = uuid.uuid4()
        permission_ids[code] = pid
        conn.execute(
            sa.text(
                "INSERT INTO permission (id, code, description) VALUES (:id, :code, :desc)"
            ),
            {"id": str(pid), "code": code, "desc": desc},
        )

    for role_name, codes in ROLE_PERMS.items():
        row = conn.execute(
            sa.text("SELECT id FROM role WHERE name = :name"),
            {"name": role_name},
        ).fetchone()
        if not row:
            continue
        role_id = row[0]
        for code in codes:
            conn.execute(
                sa.text(
                    "INSERT INTO role_permission (role_id, permission_id) VALUES (:role_id, :permission_id)"
                ),
                {"role_id": role_id, "permission_id": str(permission_ids[code])},
            )


def downgrade():
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            DELETE FROM role_permission
            WHERE permission_id IN (
                SELECT id FROM permission WHERE code IN ('personnel.read', 'personnel.write')
            )
            """
        )
    )
    conn.execute(
        sa.text(
            "DELETE FROM permission WHERE code IN ('personnel.read', 'personnel.write')"
        )
    )
    op.drop_index("ix_warehouse_employee_shift", table_name="warehouse_employee")
    op.drop_index("ix_warehouse_employee_status", table_name="warehouse_employee")
    op.drop_index("ix_warehouse_employee_employee_code", table_name="warehouse_employee")
    op.drop_table("warehouse_employee")
