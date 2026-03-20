"""Журнал agent chat; право agent.use для роли viewer.

Revision ID: p4q5r6s7t8u9
Revises: o3p4q5r6s7t8
Create Date: 2026-03-20

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "p4q5r6s7t8u9"
down_revision = "o3p4q5r6s7t8"
branch_labels = None
depends_on = None

PERM_AGENT_USE = "agent.use"


def upgrade():
    op.create_table(
        "agent_chat_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("message_preview", sa.String(length=500), nullable=False),
        sa.Column("reply_preview", sa.String(length=500), nullable=False),
        sa.Column("ollama_available", sa.Boolean(), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_chat_log_user_id", "agent_chat_log", ["user_id"])
    op.create_index("ix_agent_chat_log_created_at", "agent_chat_log", ["created_at"])

    conn = op.get_bind()
    perm_row = conn.execute(
        sa.text("SELECT id FROM permission WHERE code = :code"),
        {"code": PERM_AGENT_USE},
    ).fetchone()
    if not perm_row:
        return
    pid = perm_row[0]
    viewer = conn.execute(
        sa.text("SELECT id FROM role WHERE name = 'viewer'"),
    ).fetchone()
    if not viewer:
        return
    rid = viewer[0]
    conn.execute(
        sa.text(
            """
            INSERT INTO role_permission (role_id, permission_id)
            SELECT :rid, :pid
            WHERE NOT EXISTS (
                SELECT 1 FROM role_permission
                WHERE role_id = :rid AND permission_id = :pid
            )
            """
        ),
        {"rid": str(rid), "pid": str(pid)},
    )


def downgrade():
    conn = op.get_bind()
    perm_row = conn.execute(
        sa.text("SELECT id FROM permission WHERE code = :code"),
        {"code": PERM_AGENT_USE},
    ).fetchone()
    viewer = conn.execute(
        sa.text("SELECT id FROM role WHERE name = 'viewer'"),
    ).fetchone()
    if perm_row and viewer:
        conn.execute(
            sa.text(
                "DELETE FROM role_permission WHERE role_id = :rid AND permission_id = :pid"
            ),
            {"rid": str(viewer[0]), "pid": str(perm_row[0])},
        )

    op.drop_index("ix_agent_chat_log_created_at", table_name="agent_chat_log")
    op.drop_index("ix_agent_chat_log_user_id", table_name="agent_chat_log")
    op.drop_table("agent_chat_log")
