"""Feature flags, integration inbox, agent runs, simulation scenarios, policies, permissions.

Revision ID: u9v8w7x6y5z4
Revises: t0u1v2x3y4z5
Create Date: 2026-03-21

"""

import json
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "u9v8w7x6y5z4"
down_revision = "t0u1v2x3y4z5"
branch_labels = None
depends_on = None

PERMISSIONS = [
    ("warehouse.tasks.read", "Просмотр складских заданий (WMS)"),
    ("warehouse.tasks.manage", "Создание и изменение складских заданий"),
    ("warehouse.telemetry.ingest", "Запись телеметрии датчиков"),
    ("integrations.inbox.read", "Просмотр очереди входящих интеграций"),
    ("integrations.inbox.write", "Приём событий во входящую очередь"),
    ("agent.policies.read", "Просмотр политик ассистента"),
    ("agent.policies.manage", "Изменение политик ассистента"),
]

ROLE_TASKS_READ = ("admin", "manager", "warehouse")
ROLE_TASKS_MANAGE = ("admin", "manager")
ROLE_TELEMETRY_INGEST = ("admin", "manager")
ROLE_INBOX_READ = ("admin", "manager")
ROLE_INBOX_WRITE = ("admin",)
ROLE_AGENT_POLICIES_READ = ("admin", "manager", "warehouse")
ROLE_AGENT_POLICIES_MANAGE = ("admin",)


def _grant_to_roles(conn, perm_id: uuid.UUID, role_names: tuple[str, ...]) -> None:
    for role_name in role_names:
        row = conn.execute(
            sa.text("SELECT id FROM role WHERE name = :name"),
            {"name": role_name},
        ).fetchone()
        if not row:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid) "
                "ON CONFLICT (role_id, permission_id) DO NOTHING"
            ),
            {"rid": str(row[0]), "pid": str(perm_id)},
        )


def upgrade():
    conn = op.get_bind()
    perm_ids: dict[str, uuid.UUID] = {}
    for code, desc in PERMISSIONS:
        pid = uuid.uuid4()
        perm_ids[code] = pid
        conn.execute(
            sa.text(
                "INSERT INTO permission (id, code, description) VALUES (:id, :code, :desc)"
            ),
            {"id": str(pid), "code": code, "desc": desc},
        )

    _grant_to_roles(conn, perm_ids["warehouse.tasks.read"], ROLE_TASKS_READ)
    _grant_to_roles(conn, perm_ids["warehouse.tasks.manage"], ROLE_TASKS_MANAGE)
    _grant_to_roles(conn, perm_ids["warehouse.telemetry.ingest"], ROLE_TELEMETRY_INGEST)
    _grant_to_roles(conn, perm_ids["integrations.inbox.read"], ROLE_INBOX_READ)
    _grant_to_roles(conn, perm_ids["integrations.inbox.write"], ROLE_INBOX_WRITE)
    _grant_to_roles(conn, perm_ids["agent.policies.read"], ROLE_AGENT_POLICIES_READ)
    _grant_to_roles(conn, perm_ids["agent.policies.manage"], ROLE_AGENT_POLICIES_MANAGE)

    op.create_table(
        "feature_flag",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("description", sa.String(length=512), nullable=True),
        sa.Column("meta", JSONB(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key", name="uq_feature_flag_key"),
    )
    op.create_index("ix_feature_flag_key", "feature_flag", ["key"], unique=True)

    op.create_table(
        "agent_policy",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("rules", JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_agent_policy_code"),
    )
    op.create_index("ix_agent_policy_code", "agent_policy", ["code"], unique=True)

    op.create_table(
        "integration_inbox",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("source", sa.String(length=128), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("payload", JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_integration_inbox_status", "integration_inbox", ["status"])
    op.create_index("ix_integration_inbox_created_at", "integration_inbox", ["created_at"])

    op.create_table(
        "simulation_scenario",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=1024), nullable=True),
        sa.Column("config", JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("baseline_kpis", JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by_user_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["user.id"],
            name="fk_simulation_scenario_user",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_simulation_scenario_created_by",
        "simulation_scenario",
        ["created_by_user_id"],
    )

    op.create_table(
        "agent_run",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("agent_chat_log_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ollama_available", sa.Boolean(), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("steps", JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("public_reasoning", JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            name="fk_agent_run_user",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["agent_chat_log_id"],
            ["agent_chat_log.id"],
            name="fk_agent_run_chat_log",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "agent_chat_log_id",
            name="uq_agent_run_agent_chat_log_id",
        ),
    )
    op.create_index("ix_agent_run_user_id", "agent_run", ["user_id"])
    op.create_index("ix_agent_run_created_at", "agent_run", ["created_at"])

    ff_id = uuid.uuid4()
    conn.execute(
        sa.text(
            "INSERT INTO feature_flag (id, key, enabled, description) "
            "VALUES (:id, :k, :e, :d)"
        ),
        {
            "id": str(ff_id),
            "k": "control_tower.enabled",
            "e": True,
            "d": "Экран Control Tower в UI",
        },
    )

    pol_id = uuid.uuid4()
    rules_obj = {
        "sandbox_default": True,
        "act_requires_superuser": True,
        "act_requires_client_flag": True,
    }
    conn.execute(
        sa.text(
            "INSERT INTO agent_policy (id, code, title, rules) VALUES "
            "(:id, :code, :title, CAST(:rules AS jsonb))"
        ),
        {
            "id": str(pol_id),
            "code": "tool_execution",
            "title": "Выполнение инструментов ассистента",
            "rules": json.dumps(rules_obj),
        },
    )


def downgrade():
    conn = op.get_bind()
    op.drop_index("ix_agent_run_created_at", table_name="agent_run")
    op.drop_index("ix_agent_run_user_id", table_name="agent_run")
    op.drop_table("agent_run")

    op.drop_index("ix_simulation_scenario_created_by", table_name="simulation_scenario")
    op.drop_table("simulation_scenario")

    op.drop_index("ix_integration_inbox_created_at", table_name="integration_inbox")
    op.drop_index("ix_integration_inbox_status", table_name="integration_inbox")
    op.drop_table("integration_inbox")

    op.drop_index("ix_agent_policy_code", table_name="agent_policy")
    op.drop_table("agent_policy")

    op.drop_index("ix_feature_flag_key", table_name="feature_flag")
    op.drop_table("feature_flag")

    for code, _desc in PERMISSIONS:
        row = conn.execute(
            sa.text("SELECT id FROM permission WHERE code = :code"),
            {"code": code},
        ).fetchone()
        if not row:
            continue
        pid = row[0]
        conn.execute(
            sa.text("DELETE FROM role_permission WHERE permission_id = :pid"),
            {"pid": str(pid)},
        )
        conn.execute(
            sa.text("DELETE FROM permission WHERE id = :pid"),
            {"pid": str(pid)},
        )
