"""Report email delivery log (idempotency).

Revision ID: g1a2b3c4d5e7
Revises: g0a1b2c3d4e6
Create Date: 2026-03-18

"""

from alembic import op
import sqlalchemy as sa

revision = "g1a2b3c4d5e7"
down_revision = "g0a1b2c3d4e6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "report_email_delivery_log",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("report_key", sa.String(length=64), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("error", sa.String(length=2048), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_report_email_delivery_log_user_id",
        "report_email_delivery_log",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_report_email_delivery_log_report_key",
        "report_email_delivery_log",
        ["report_key"],
        unique=False,
    )
    op.create_index(
        "ix_report_email_delivery_log_period_start",
        "report_email_delivery_log",
        ["period_start"],
        unique=False,
    )
    op.create_index(
        "ix_report_email_delivery_log_period_end",
        "report_email_delivery_log",
        ["period_end"],
        unique=False,
    )
    op.create_index(
        "uq_report_email_delivery_log_user_key_period",
        "report_email_delivery_log",
        ["user_id", "report_key", "period_start", "period_end"],
        unique=True,
    )


def downgrade():
    op.drop_index(
        "uq_report_email_delivery_log_user_key_period",
        table_name="report_email_delivery_log",
    )
    op.drop_index(
        "ix_report_email_delivery_log_period_end",
        table_name="report_email_delivery_log",
    )
    op.drop_index(
        "ix_report_email_delivery_log_period_start",
        table_name="report_email_delivery_log",
    )
    op.drop_index(
        "ix_report_email_delivery_log_report_key",
        table_name="report_email_delivery_log",
    )
    op.drop_index(
        "ix_report_email_delivery_log_user_id",
        table_name="report_email_delivery_log",
    )
    op.drop_table("report_email_delivery_log")

