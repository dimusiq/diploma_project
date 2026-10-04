"""Акт инвентаризации: inventory_count_act + inventory_count_line.

Revision ID: ff2a3b4c5d6e
Revises: ee1f2a3b4c5d
Create Date: 2026-10-04

Цикл count → факт → расхождение → проведение акта с обновлением остатка.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "ff2a3b4c5d6e"
down_revision = "ee1f2a3b4c5d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inventory_count_act",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_task_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "status", sa.String(length=16), nullable=False, server_default="draft"
        ),
        sa.Column("mode", sa.String(length=32), nullable=False, server_default="selective"),
        sa.Column("reason", sa.String(length=512), nullable=True),
        sa.Column("actor_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("posted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["warehouse_id"], ["warehouse.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["warehouse_task_id"],
            ["warehouse_task.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"], ["user.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "warehouse_task_id", name="uq_inventory_count_act_warehouse_task_id"
        ),
    )
    op.create_index(
        "ix_inventory_count_act_warehouse_id",
        "inventory_count_act",
        ["warehouse_id"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_count_act_status",
        "inventory_count_act",
        ["status"],
        unique=False,
    )

    op.create_table(
        "inventory_count_line",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("act_id", UUID(as_uuid=True), nullable=False),
        sa.Column("item_id", UUID(as_uuid=True), nullable=False),
        sa.Column("slot_key", sa.String(length=128), nullable=True),
        sa.Column("sku", sa.String(length=64), nullable=True),
        sa.Column("system_qty", sa.Integer(), nullable=False),
        sa.Column("counted_qty", sa.Integer(), nullable=True),
        sa.Column("variance", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["act_id"], ["inventory_count_act.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["item_id"], ["item.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "act_id", "item_id", name="uq_inventory_count_line_act_item"
        ),
    )
    op.create_index(
        "ix_inventory_count_line_act_id",
        "inventory_count_line",
        ["act_id"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_count_line_item_id",
        "inventory_count_line",
        ["item_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_inventory_count_line_item_id", table_name="inventory_count_line")
    op.drop_index("ix_inventory_count_line_act_id", table_name="inventory_count_line")
    op.drop_table("inventory_count_line")
    op.drop_index("ix_inventory_count_act_status", table_name="inventory_count_act")
    op.drop_index(
        "ix_inventory_count_act_warehouse_id", table_name="inventory_count_act"
    )
    op.drop_table("inventory_count_act")
