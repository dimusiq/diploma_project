"""Add role table and user.role_id

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-01-26

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "role",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=32), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_role_name", "role", ["name"], unique=True)

    conn = op.get_bind()
    for name in ("admin", "manager", "warehouse", "viewer"):
        conn.execute(
            sa.text("INSERT INTO role (id, name) VALUES (:id, :name)"),
            {"id": str(uuid.uuid4()), "name": name},
        )

    op.add_column(
        "user",
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    op.execute(
        sa.text(
            """
            UPDATE "user" SET role_id = (SELECT id FROM role WHERE name = 'viewer' LIMIT 1)
            WHERE role_id IS NULL
            """
        )
    )

    op.create_foreign_key(
        "user_role_id_fkey",
        "user",
        "role",
        ["role_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("user_role_id_fkey", "user", type_="foreignkey")
    op.drop_column("user", "role_id")
    op.drop_index("ix_role_name", table_name="role")
    op.drop_table("role")
