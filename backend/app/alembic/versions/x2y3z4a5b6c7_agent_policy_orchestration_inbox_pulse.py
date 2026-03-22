"""Twin pulse for integration inbox, orchestration jobs, pending source, policy hooks.

Revision ID: x2y3z4a5b6c7
Revises: w1x2y3z4a5b6
Create Date: 2026-03-22

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "x2y3z4a5b6c7"
down_revision = "w1x2y3z4a5b6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "integration_inbox",
        sa.Column("twin_published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_integration_inbox_twin_published_at",
        "integration_inbox",
        ["twin_published_at"],
        unique=False,
    )

    op.add_column(
        "agent_pending_action",
        sa.Column("source", sa.String(length=32), nullable=False, server_default="manual"),
    )

    op.create_table(
        "agent_orchestration_job",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("operation_session_id", UUID(as_uuid=True), nullable=True),
        sa.Column("job_type", sa.String(length=64), nullable=False),
        sa.Column("payload", JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("run_after", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("result", JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["operation_session_id"],
            ["agent_operation_session.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_agent_orch_job_status_run_after",
        "agent_orchestration_job",
        ["status", "run_after"],
        unique=False,
    )
    op.create_index(
        "ix_agent_orch_job_user_id",
        "agent_orchestration_job",
        ["user_id"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_agent_orch_job_user_id", table_name="agent_orchestration_job")
    op.drop_index("ix_agent_orch_job_status_run_after", table_name="agent_orchestration_job")
    op.drop_table("agent_orchestration_job")
    op.drop_column("agent_pending_action", "source")
    op.drop_index("ix_integration_inbox_twin_published_at", table_name="integration_inbox")
    op.drop_column("integration_inbox", "twin_published_at")
