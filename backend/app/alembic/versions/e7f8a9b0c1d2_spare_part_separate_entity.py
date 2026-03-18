"""Spare parts as separate entity: spare_part table, reservations/consumption use spare_part_id, remove item.min_quantity.

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa

revision = "e7f8a9b0c1d2"
down_revision = "d6e7f8a9b0c1"
branch_labels = None
depends_on = None


def upgrade():
    # Таблица склада запчастей (отдельная сущность)
    op.create_table(
        "spare_part",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("sku", sa.String(length=64), nullable=True),
        sa.Column("description", sa.String(length=512), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("min_quantity", sa.Integer(), nullable=True),
        sa.Column("unit", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # Пересоздать резерв и списание с привязкой к spare_part
    op.drop_table("workorder_part_consumption")
    op.drop_table("workorder_part_reservation")

    op.create_table(
        "workorder_part_reservation",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("work_order_id", sa.Uuid(), nullable=False),
        sa.Column("spare_part_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["spare_part_id"], ["spare_part.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_id"], ["workorder.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "workorder_part_consumption",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("work_order_id", sa.Uuid(), nullable=False),
        sa.Column("spare_part_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["spare_part_id"], ["spare_part.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_id"], ["workorder.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Убрать min_quantity у item (склад запчастей — отдельная сущность)
    op.drop_column("item", "min_quantity")


def downgrade():
    op.add_column("item", sa.Column("min_quantity", sa.Integer(), nullable=True))

    op.drop_table("workorder_part_consumption")
    op.drop_table("workorder_part_reservation")

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

    op.drop_table("spare_part")
