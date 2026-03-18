"""Notification table for notification center.

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa

revision = "f8a9b0c1d2e3"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "notification",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("body", sa.String(length=2048), nullable=True),
        sa.Column("source", sa.String(length=128), nullable=True),
        sa.Column("entity_type", sa.String(length=64), nullable=True),
        sa.Column("entity_id", sa.Uuid(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notification_type", "notification", ["type"], unique=False)
    op.create_index("ix_notification_user_id", "notification", ["user_id"], unique=False)


def downgrade():
    op.drop_index("ix_notification_user_id", table_name="notification")
    op.drop_index("ix_notification_type", table_name="notification")
    op.drop_table("notification")
