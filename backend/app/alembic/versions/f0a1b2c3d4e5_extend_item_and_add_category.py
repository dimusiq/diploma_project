"""Extend Item with quantity, sku, barcode, unit, category_id, expires_at, location, created_at; add Category table

Revision ID: f0a1b2c3d4e5
Revises: 1a31ce608336
Create Date: 2025-01-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f0a1b2c3d4e5"
down_revision = "1a31ce608336"
branch_labels = None
depends_on = None


def upgrade():
    # 1) Таблица category
    op.create_table(
        "category",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # 2) Новые колонки в item
    op.add_column(
        "item",
        sa.Column("quantity", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )
    op.add_column(
        "item",
        sa.Column("sku", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "item",
        sa.Column("barcode", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "item",
        sa.Column("unit", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "item",
        sa.Column("expires_at", sa.Date(), nullable=True),
    )
    op.add_column(
        "item",
        sa.Column("location", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "item",
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "item",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_foreign_key(
        "item_category_id_fkey",
        "item",
        "category",
        ["category_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("item_category_id_fkey", "item", type_="foreignkey")
    op.drop_column("item", "created_at")
    op.drop_column("item", "category_id")
    op.drop_column("item", "location")
    op.drop_column("item", "expires_at")
    op.drop_column("item", "unit")
    op.drop_column("item", "barcode")
    op.drop_column("item", "sku")
    op.drop_column("item", "quantity")
    op.drop_table("category")
