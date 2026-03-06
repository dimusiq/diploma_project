"""Add last_login_at to user

Revision ID: a2b3c4d5e6f7
Revises: e3f4a5b6c7d8
Create Date: 2026-03-04

"""
from alembic import op
import sqlalchemy as sa

revision = "a2b3c4d5e6f7"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "user",
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("user", "last_login_at")
