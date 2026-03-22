"""Agent operation sessions, pending actions, chat log link, connector inbox tool support.

Revision ID: w1x2y3z4a5b6
Revises: v0w1x2y3z4a5
Create Date: 2026-03-22

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "w1x2y3z4a5b6"
down_revision = "v0w1x2y3z4a5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "agent_operation_session",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("rolling_summary", sa.Text(), nullable=True),
        sa.Column("facts", JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_agent_operation_session_user_id",
        "agent_operation_session",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_agent_operation_session_status",
        "agent_operation_session",
        ["status"],
        unique=False,
    )

    op.create_table(
        "agent_pending_action",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("agent_run_id", UUID(as_uuid=True), nullable=True),
        sa.Column("tool_name", sa.String(length=128), nullable=False),
        sa.Column("arguments", JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("result_preview", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_user_id", UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_run.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["resolved_by_user_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_agent_pending_action_user_id",
        "agent_pending_action",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_agent_pending_action_status",
        "agent_pending_action",
        ["status"],
        unique=False,
    )

    op.add_column(
        "agent_chat_log",
        sa.Column("operation_session_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_agent_chat_log_operation_session",
        "agent_chat_log",
        "agent_operation_session",
        ["operation_session_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_agent_chat_log_operation_session_id",
        "agent_chat_log",
        ["operation_session_id"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_agent_chat_log_operation_session_id", table_name="agent_chat_log")
    op.drop_constraint("fk_agent_chat_log_operation_session", "agent_chat_log", type_="foreignkey")
    op.drop_column("agent_chat_log", "operation_session_id")
    op.drop_index("ix_agent_pending_action_status", table_name="agent_pending_action")
    op.drop_index("ix_agent_pending_action_user_id", table_name="agent_pending_action")
    op.drop_table("agent_pending_action")
    op.drop_index("ix_agent_operation_session_status", table_name="agent_operation_session")
    op.drop_index("ix_agent_operation_session_user_id", table_name="agent_operation_session")
    op.drop_table("agent_operation_session")
