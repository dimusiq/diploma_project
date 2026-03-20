"""Расширение pgvector и колонка embedding_vec для RAG.

Revision ID: o3p4q5r6s7t8
Revises: n2o3p4q5r6s7
Create Date: 2026-03-20

"""

from alembic import op

from app.core.agent_vector import AGENT_EMBEDDING_VECTOR_DIMENSIONS

revision = "o3p4q5r6s7t8"
down_revision = "n2o3p4q5r6s7"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    dim = AGENT_EMBEDDING_VECTOR_DIMENSIONS
    op.execute(
        f"ALTER TABLE agent_knowledge_chunk ADD COLUMN IF NOT EXISTS "
        f"embedding_vec vector({dim})"
    )
    op.execute(
        f"""
        UPDATE agent_knowledge_chunk
        SET embedding_vec = (
            '[' || (
                SELECT string_agg(je::text, ',')
                FROM jsonb_array_elements(embedding) AS je
            ) || ']'
        )::vector
        WHERE embedding IS NOT NULL
          AND jsonb_typeof(embedding) = 'array'
          AND jsonb_array_length(embedding) = {dim}
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_agent_knowledge_chunk_embedding_vec_hnsw
        ON agent_knowledge_chunk
        USING hnsw (embedding_vec vector_cosine_ops)
        """
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_agent_knowledge_chunk_embedding_vec_hnsw")
    op.execute(
        "ALTER TABLE agent_knowledge_chunk DROP COLUMN IF EXISTS embedding_vec"
    )
