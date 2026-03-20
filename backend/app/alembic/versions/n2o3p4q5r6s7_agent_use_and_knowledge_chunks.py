"""Право agent.use, таблица справочных фрагментов для RAG ассистента.

Revision ID: n2o3p4q5r6s7
Revises: m1n2o3p4q5r6
Create Date: 2026-03-20

"""

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "n2o3p4q5r6s7"
down_revision = "m1n2o3p4q5r6"
branch_labels = None
depends_on = None

PERM_CODE = "agent.use"
PERM_DESC = "Использование чат-ассистента по складу"

# Только эти роли получают ассистента по умолчанию (viewer — без права).
ROLES_WITH_AGENT = ("admin", "manager", "warehouse")

_SEED_CHUNKS = [
    (
        uuid.UUID("b1000001-0001-4000-8000-000000000001"),
        "seed",
        "Координаты ячейки на складе",
        "Ячейка задаётся четырьмя числами: ряд (storage_row), уровень (storage_level), "
        "позиция по X (storage_cell_x) и Z (storage_cell_z). В интерфейсе часто используют "
        "подписи «ряд», «уровень», «ячейка». Формат slot_key в API и 3D: нулевые индексы через дефис.",
    ),
    (
        uuid.UUID("b1000001-0001-4000-8000-000000000002"),
        "seed",
        "Статусы товара",
        "Товар может быть в статусе поступления (incoming), на складе (warehouse) или в отгрузке "
        "(shipment). Учёт остатков и ячеек относится к товарам на складе и размещённым в ячейках.",
    ),
    (
        uuid.UUID("b1000001-0001-4000-8000-000000000003"),
        "seed",
        "Цифровой двойник (3D)",
        "Раздел «3D Склад» показывает геометрию активного layout и занятость ячеек по данным системы. "
        "Клик по ячейке открывает состав; навигация по URL-параметрам поддерживает deep link.",
    ),
]


def upgrade():
    conn = op.get_bind()
    perm_id = uuid.uuid4()
    conn.execute(
        sa.text(
            "INSERT INTO permission (id, code, description) VALUES (:id, :code, :desc)"
        ),
        {"id": str(perm_id), "code": PERM_CODE, "desc": PERM_DESC},
    )

    for role_name in ROLES_WITH_AGENT:
        row = conn.execute(
            sa.text("SELECT id FROM role WHERE name = :name"),
            {"name": role_name},
        ).fetchone()
        if not row:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)"
            ),
            {"rid": str(row[0]), "pid": str(perm_id)},
        )

    op.create_table(
        "agent_knowledge_chunk",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "source",
            sa.String(length=128),
            nullable=False,
            server_default=sa.text("'manual'"),
        ),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_agent_knowledge_chunk_source",
        "agent_knowledge_chunk",
        ["source"],
    )

    for cid, source, title, content in _SEED_CHUNKS:
        conn.execute(
            sa.text(
                "INSERT INTO agent_knowledge_chunk (id, source, title, content) "
                "VALUES (:id, :source, :title, :content)"
            ),
            {
                "id": str(cid),
                "source": source,
                "title": title,
                "content": content,
            },
        )


def downgrade():
    conn = op.get_bind()
    row = conn.execute(
        sa.text("SELECT id FROM permission WHERE code = :code"),
        {"code": PERM_CODE},
    ).fetchone()
    if row:
        pid = row[0]
        conn.execute(
            sa.text("DELETE FROM role_permission WHERE permission_id = :pid"),
            {"pid": str(pid)},
        )
        conn.execute(
            sa.text("DELETE FROM permission WHERE id = :pid"),
            {"pid": str(pid)},
        )

    op.drop_index("ix_agent_knowledge_chunk_source", table_name="agent_knowledge_chunk")
    op.drop_table("agent_knowledge_chunk")
