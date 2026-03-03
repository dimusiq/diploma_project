"""Granular permissions (Permission, RolePermission) and AuditLog.

Revision ID: e3f4a5b6c7d8
Revises: a8b9c0d1e2f3
Create Date: 2026-02-22

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e3f4a5b6c7d8"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None

# Коды прав и шаблоны ролей (какие права давать каждой роли)
PERMISSION_CODES = [
    ("items.read_all", "Видеть все товары (не только свои)"),
    ("items.change_status", "Менять статус товара"),
    ("users.manage", "Управление пользователями"),
    ("roles.read", "Просмотр ролей"),
    ("categories.manage", "Управление категориями"),
    ("brands.manage", "Управление брендами техники"),
    ("zones.manage", "Управление зонами склада"),
    ("audit.read", "Просмотр журнала аудита"),
]

ROLE_TEMPLATES = {
    "admin": [
        "items.read_all",
        "items.change_status",
        "users.manage",
        "roles.read",
        "categories.manage",
        "brands.manage",
        "zones.manage",
        "audit.read",
    ],
    "manager": ["items.read_all", "items.change_status"],
    "warehouse": ["items.read_all", "items.change_status"],
    "viewer": [],
}


def upgrade():
    op.create_table(
        "permission",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_permission_code", "permission", ["code"], unique=True)

    op.create_table(
        "role_permission",
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("permission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["permission_id"],
            ["permission.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["role.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("role_id", "permission_id"),
    )

    op.create_table(
        "auditlog",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("details", sa.String(length=4096), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auditlog_created_at", "auditlog", ["created_at"])
    op.create_index("ix_auditlog_user_id", "auditlog", ["user_id"])
    op.create_index("ix_auditlog_resource_type", "auditlog", ["resource_type"])

    conn = op.get_bind()
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

    for role_name, codes in ROLE_TEMPLATES.items():
        row = conn.execute(
            sa.text("SELECT id FROM role WHERE name = :name"),
            {"name": role_name},
        ).fetchone()
        if not row:
            continue
        role_id = row[0]
        for code in codes:
            perm_id = permission_ids[code]
            conn.execute(
                sa.text(
                    "INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)"
                ),
                {"rid": str(role_id), "pid": str(perm_id)},
            )



def downgrade():
    op.drop_index("ix_auditlog_resource_type", table_name="auditlog")
    op.drop_index("ix_auditlog_user_id", table_name="auditlog")
    op.drop_index("ix_auditlog_created_at", table_name="auditlog")
    op.drop_table("auditlog")
    op.drop_table("role_permission")
    op.drop_index("ix_permission_code", table_name="permission")
    op.drop_table("permission")
