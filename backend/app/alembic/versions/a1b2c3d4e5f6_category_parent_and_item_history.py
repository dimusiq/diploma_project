"""Category parent_id and ItemHistory table

Revision ID: a1b2c3d4e5f6
Revises: f0a1b2c3d4e5
Create Date: 2025-01-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a1b2c3d4e5f6"
down_revision = "f0a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade():
    # 1) Category.parent_id
    op.add_column(
        "category",
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "category_parent_id_fkey",
        "category",
        "category",
        ["parent_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # 2) item_history
    op.create_table(
        "itemhistory",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("field_name", sa.String(length=64), nullable=False),
        sa.Column("old_value", sa.String(length=512), nullable=False, server_default=sa.text("''")),
        sa.Column("new_value", sa.String(length=512), nullable=False, server_default=sa.text("''")),
        sa.ForeignKeyConstraint(["item_id"], ["item.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade():
    op.drop_table("itemhistory")
    op.drop_constraint("category_parent_id_fkey", "category", type_="foreignkey")
    op.drop_column("category", "parent_id")
