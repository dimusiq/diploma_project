"""User communication preferences (notification/report channels).

Revision ID: g0a1b2c3d4e6
Revises: f9a0b1c2d3e4
Create Date: 2026-03-18

"""

from alembic import op
import sqlalchemy as sa

revision = "g0a1b2c3d4e6"
down_revision = "f9a0b1c2d3e4"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_communication_preference",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("in_app_enabled", sa.Boolean(), nullable=False),
        sa.Column("email_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_communication_preference_user_id",
        "user_communication_preference",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_user_communication_preference_kind",
        "user_communication_preference",
        ["kind"],
        unique=False,
    )
    op.create_index(
        "ix_user_communication_preference_key",
        "user_communication_preference",
        ["key"],
        unique=False,
    )
    op.create_index(
        "uq_user_communication_preference_user_kind_key",
        "user_communication_preference",
        ["user_id", "kind", "key"],
        unique=True,
    )


def downgrade():
    op.drop_index(
        "uq_user_communication_preference_user_kind_key",
        table_name="user_communication_preference",
    )
    op.drop_index(
        "ix_user_communication_preference_key", table_name="user_communication_preference"
    )
    op.drop_index(
        "ix_user_communication_preference_kind",
        table_name="user_communication_preference",
    )
    op.drop_index(
        "ix_user_communication_preference_user_id",
        table_name="user_communication_preference",
    )
    op.drop_table("user_communication_preference")

