"""Пользовательские чаты ассистента (история между устройствами).

Revision ID: c0d1e2f3a4b5
Revises: z5b6c7d8e9f0
Create Date: 2026-03-26

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "c0d1e2f3a4b5"
down_revision = "z5b6c7d8e9f0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "agent_user_chat",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_user_chat_user_id", "agent_user_chat", ["user_id"])
    op.create_index("ix_agent_user_chat_user_id_updated_at", "agent_user_chat", ["user_id", "updated_at"])

    op.create_table(
        "agent_user_chat_message",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("chat_id", UUID(as_uuid=True), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("assistant_meta", JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["chat_id"], ["agent_user_chat.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chat_id", "seq", name="uq_agent_user_chat_message_chat_seq"),
    )
    op.create_index("ix_agent_user_chat_message_chat_id", "agent_user_chat_message", ["chat_id"])


def downgrade():
    op.drop_index("ix_agent_user_chat_message_chat_id", table_name="agent_user_chat_message")
    op.drop_table("agent_user_chat_message")
    op.drop_index("ix_agent_user_chat_user_id_updated_at", table_name="agent_user_chat")
    op.drop_index("ix_agent_user_chat_user_id", table_name="agent_user_chat")
    op.drop_table("agent_user_chat")
