"""Эмбеддинги для чанков базы знаний (OpenAI/vLLM API + pgvector)."""

from __future__ import annotations

import uuid

from sqlmodel import Session, select

from app.core.agent_vector import AGENT_EMBEDDING_VECTOR_DIMENSIONS
from app.models import AgentKnowledgeChunk
from app.services.agent_rag import ollama_embed


async def embed_chunk(session: Session, chunk_id: uuid.UUID) -> bool:
    chunk = session.get(AgentKnowledgeChunk, chunk_id)
    if not chunk:
        return False
    text = f"{chunk.title.strip()}\n{chunk.content.strip()}"
    vec = await ollama_embed(text)
    if not vec or len(vec) != AGENT_EMBEDDING_VECTOR_DIMENSIONS:
        return False
    chunk.embedding = vec
    chunk.embedding_vec = vec
    session.add(chunk)
    session.commit()
    session.refresh(chunk)
    return True


async def embed_all_chunks(session: Session) -> tuple[int, int]:
    """Пересчитать эмбеддинги для всех чанков. Возвращает (успех, ошибок)."""
    chunks = list(session.exec(select(AgentKnowledgeChunk)).all())
    ok = 0
    fail = 0
    for ch in chunks:
        if await embed_chunk(session, ch.id):
            ok += 1
        else:
            fail += 1
    return ok, fail
