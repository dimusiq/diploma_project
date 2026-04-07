"""User avatar file extension (stored as WebP on disk).

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-04-03

"""

from alembic import op
import sqlalchemy as sa

revision = "d1e2f3a4b5c6"
down_revision = "c0d1e2f3a4b5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "user",
        sa.Column("avatar_ext", sa.String(length=8), nullable=True),
    )


def downgrade():
    op.drop_column("user", "avatar_ext")
