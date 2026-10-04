"""Резерв товара: item.reserved_quantity + item_reservation.

Revision ID: ee1f2a3b4c5d
Revises: dd0e1f2a3b4c
Create Date: 2026-10-04

available = quantity - reserved_quantity; резерв под pick-задачи исходящих заказов.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "ee1f2a3b4c5d"
down_revision = "dd0e1f2a3b4c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "item",
        sa.Column(
            "reserved_quantity",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.create_table(
        "item_reservation",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("item_id", UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_task_id", UUID(as_uuid=True), nullable=False),
        sa.Column("outbound_order_id", UUID(as_uuid=True), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.String(length=16), nullable=False, server_default="active"
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["item_id"], ["item.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["warehouse_task_id"],
            ["warehouse_task.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["outbound_order_id"],
            ["outbound_order.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "warehouse_task_id", name="uq_item_reservation_warehouse_task_id"
        ),
    )
    op.create_index(
        "ix_item_reservation_item_id", "item_reservation", ["item_id"], unique=False
    )
    op.create_index(
        "ix_item_reservation_warehouse_task_id",
        "item_reservation",
        ["warehouse_task_id"],
        unique=False,
    )
    op.create_index(
        "ix_item_reservation_outbound_order_id",
        "item_reservation",
        ["outbound_order_id"],
        unique=False,
    )
    op.create_index(
        "ix_item_reservation_status", "item_reservation", ["status"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_item_reservation_status", table_name="item_reservation")
    op.drop_index(
        "ix_item_reservation_outbound_order_id", table_name="item_reservation"
    )
    op.drop_index(
        "ix_item_reservation_warehouse_task_id", table_name="item_reservation"
    )
    op.drop_index("ix_item_reservation_item_id", table_name="item_reservation")
    op.drop_table("item_reservation")
    op.drop_column("item", "reserved_quantity")
