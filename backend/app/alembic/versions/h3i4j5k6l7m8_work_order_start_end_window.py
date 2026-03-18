"""Work order scheduling window: start_at/end_at.

Revision ID: h3i4j5k6l7m8
Revises: g1a2b3c4d5e7
Create Date: 2026-03-18
"""

from alembic import op
import sqlalchemy as sa

revision = "h3i4j5k6l7m8"
down_revision = "g1a2b3c4d5e7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "workorder",
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "workorder",
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("workorder", "end_at")
    op.drop_column("workorder", "start_at")

