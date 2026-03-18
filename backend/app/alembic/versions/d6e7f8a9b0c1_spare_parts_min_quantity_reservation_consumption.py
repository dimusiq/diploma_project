"""Spare parts: item min_quantity, work order part reservation and consumption.

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa

revision = "d6e7f8a9b0c1"
down_revision = "c5d6e7f8a9b0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("item", sa.Column("min_quantity", sa.Integer(), nullable=True))

    op.create_table(
        "workorder_part_reservation",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("work_order_id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["item.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_id"], ["workorder.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "workorder_part_consumption",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("work_order_id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["item.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_id"], ["workorder.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade():
    op.drop_table("workorder_part_consumption")
    op.drop_table("workorder_part_reservation")
    op.drop_column("item", "min_quantity")
