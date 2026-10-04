"""Волновой и зонный отбор: pick_wave + связи + feature flag.

Revision ID: hh4b5c6d7e8f
Revises: gg3a4b5c6d7e
Create Date: 2026-10-05

Сущность волны отбора, состав заказов, закрепление зон за операторами.
Флаг outbound_wave_picking по умолчанию выключен (позаказный режим).
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "hh4b5c6d7e8f"
down_revision = "gg3a4b5c6d7e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pick_wave",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column(
            "status", sa.String(length=32), nullable=False, server_default="draft"
        ),
        sa.Column("mode", sa.String(length=16), nullable=False, server_default="batch"),
        sa.Column("criteria", JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("route_length_m", sa.Float(), nullable=True),
        sa.Column("extra", JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouse.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("warehouse_id", "code", name="uq_pick_wave_wh_code"),
    )
    op.create_index("ix_pick_wave_warehouse_id", "pick_wave", ["warehouse_id"])
    op.create_index("ix_pick_wave_status", "pick_wave", ["status"])

    op.create_table(
        "pick_wave_order",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("wave_id", UUID(as_uuid=True), nullable=False),
        sa.Column("outbound_order_id", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["wave_id"], ["pick_wave.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["outbound_order_id"], ["outbound_order.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "wave_id", "outbound_order_id", name="uq_pick_wave_order_wave_order"
        ),
    )
    op.create_index("ix_pick_wave_order_wave_id", "pick_wave_order", ["wave_id"])
    op.create_index(
        "ix_pick_wave_order_outbound_order_id",
        "pick_wave_order",
        ["outbound_order_id"],
    )

    op.create_table(
        "pick_wave_zone_assignment",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("wave_id", UUID(as_uuid=True), nullable=False),
        sa.Column("zone_code", sa.String(length=64), nullable=False),
        sa.Column("assigned_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["wave_id"], ["pick_wave.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_user_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "wave_id", "zone_code", name="uq_pick_wave_zone_assignment_wave_zone"
        ),
    )
    op.create_index(
        "ix_pick_wave_zone_assignment_wave_id",
        "pick_wave_zone_assignment",
        ["wave_id"],
    )
    op.create_index(
        "ix_pick_wave_zone_assignment_assigned_user_id",
        "pick_wave_zone_assignment",
        ["assigned_user_id"],
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO feature_flag (id, key, enabled, description) "
            "VALUES (:id, :k, :e, :d) "
            "ON CONFLICT (key) DO NOTHING"
        ),
        {
            "id": str(uuid.uuid4()),
            "k": "outbound_wave_picking",
            "e": False,
            "d": "Волновой/зонный отбор вместо позаказного (API /pick-waves)",
        },
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM feature_flag WHERE key = 'outbound_wave_picking'")
    )
    op.drop_index(
        "ix_pick_wave_zone_assignment_assigned_user_id",
        table_name="pick_wave_zone_assignment",
    )
    op.drop_index(
        "ix_pick_wave_zone_assignment_wave_id",
        table_name="pick_wave_zone_assignment",
    )
    op.drop_table("pick_wave_zone_assignment")
    op.drop_index("ix_pick_wave_order_outbound_order_id", table_name="pick_wave_order")
    op.drop_index("ix_pick_wave_order_wave_id", table_name="pick_wave_order")
    op.drop_table("pick_wave_order")
    op.drop_index("ix_pick_wave_status", table_name="pick_wave")
    op.drop_index("ix_pick_wave_warehouse_id", table_name="pick_wave")
    op.drop_table("pick_wave")
