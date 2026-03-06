"""Расписание ТО в БД: maintenance_chain, maintenance_chain_step, chain_assignment, audit, config.

Revision ID: b4c5d6e7f8a9
Revises: b3c4d5e6f7a8
Create Date: 2026-02-22

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b4c5d6e7f8a9"
down_revision = "b3c4d5e6f7a8"
branch_labels = None
depends_on = None

PERMISSION_CODES = [
    ("maintenance_schedule.view", "Просмотр расписания ТО"),
    ("maintenance_schedule.edit", "Редактирование расписания ТО"),
]

ROLE_PERMS = {
    "admin": ["maintenance_schedule.view", "maintenance_schedule.edit"],
    "manager": ["maintenance_schedule.view", "maintenance_schedule.edit"],
    "warehouse": ["maintenance_schedule.view"],
    "viewer": ["maintenance_schedule.view"],
}


def upgrade():
    op.create_table(
        "maintenance_chain",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("color_tag", sa.String(length=32), nullable=False, server_default="blue"),
        sa.Column("remind_before_hours", sa.Integer(), nullable=False, server_default="50"),
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

    op.create_table(
        "maintenance_chain_step",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chain_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("interval_hours", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["chain_id"],
            ["maintenance_chain.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_maintenance_chain_step_chain_id",
        "maintenance_chain_step",
        ["chain_id"],
    )

    op.create_table(
        "chain_assignment",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chain_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("equipment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["chain_id"],
            ["maintenance_chain.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["equipment_id"],
            ["equipment.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "chain_id",
            "equipment_id",
            name="uq_chain_assignment_chain_equipment",
        ),
    )
    op.create_index("ix_chain_assignment_chain_id", "chain_assignment", ["chain_id"])
    op.create_index("ix_chain_assignment_equipment_id", "chain_assignment", ["equipment_id"])

    op.create_table(
        "maintenance_chain_audit",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chain_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("old_intervals", sa.String(length=2048), nullable=True),
        sa.Column("new_intervals", sa.String(length=2048), nullable=True),
        sa.Column("details", sa.String(length=1024), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["chain_id"],
            ["maintenance_chain.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_maintenance_chain_audit_chain_id",
        "maintenance_chain_audit",
        ["chain_id"],
    )
    op.create_index(
        "ix_maintenance_chain_audit_created_at",
        "maintenance_chain_audit",
        ["created_at"],
    )

    op.create_table(
        "maintenance_schedule_config",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.String(length=2048), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )

    # Seed default config
    op.execute(
        sa.text(
            """
            INSERT INTO maintenance_schedule_config (key, value)
            VALUES
            ('default_intervals', '[500, 1000, 1500, 2000, 2500]'),
            ('default_remind_before_hours', '50')
            ON CONFLICT (key) DO NOTHING
            """
        )
    )

    # New permissions and role assignments
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

    for role_name, codes in ROLE_PERMS.items():
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
                    "INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid) ON CONFLICT (role_id, permission_id) DO NOTHING"
                ),
                {"rid": str(role_id), "pid": str(perm_id)},
            )


def downgrade():
    op.drop_table("maintenance_chain_audit")
    op.drop_table("chain_assignment")
    op.drop_index("ix_maintenance_chain_step_chain_id", table_name="maintenance_chain_step")
    op.drop_table("maintenance_chain_step")
    op.drop_table("maintenance_chain")
    op.drop_table("maintenance_schedule_config")

    conn = op.get_bind()
    for code, _ in PERMISSION_CODES:
        conn.execute(sa.text("DELETE FROM role_permission WHERE permission_id IN (SELECT id FROM permission WHERE code = :code)"), {"code": code})
        conn.execute(sa.text("DELETE FROM permission WHERE code = :code"), {"code": code})
