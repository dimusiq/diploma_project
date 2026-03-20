"""Колонка item.status (incoming | warehouse | …).

Revision ID: q5r6s7t8u9v0
Revises: p4q5r6s7t8u9
Create Date: 2026-03-20

"""

import sqlalchemy as sa
from alembic import op

revision = "q5r6s7t8u9v0"
down_revision = "p4q5r6s7t8u9"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "item",
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="incoming",
        ),
    )


def downgrade():
    op.drop_column("item", "status")
