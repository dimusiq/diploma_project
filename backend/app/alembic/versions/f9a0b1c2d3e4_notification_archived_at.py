"""Notification: add archived_at (archive instead of delete).

Revision ID: f9a0b1c2d3e4
Revises: f8a9b0c1d2e3
Create Date: 2026-03-18

"""

from alembic import op
import sqlalchemy as sa

revision = "f9a0b1c2d3e4"
down_revision = "f8a9b0c1d2e3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "notification",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("notification", "archived_at")

