"""CRUD базы знаний ассистента и пересчёт эмбеддингов (только суперпользователь)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import func, select

from app.api.deps import SessionDep, get_current_active_superuser
from app.models import (
    AgentKnowledgeChunk,
    AgentKnowledgeChunkAdminPublic,
    AgentKnowledgeChunkCreate,
    AgentKnowledgeChunkList,
    AgentKnowledgeChunkUpdate,
)
from app.services.agent_knowledge_embed import embed_all_chunks, embed_chunk

router = APIRouter(
    prefix="/agent/knowledge",
    tags=["agent-knowledge"],
    dependencies=[Depends(get_current_active_superuser)],
)


def _to_public(c: AgentKnowledgeChunk) -> AgentKnowledgeChunkAdminPublic:
    ready = c.embedding_vec is not None or (
        c.embedding is not None
        and isinstance(c.embedding, list)
        and len(c.embedding) > 0
    )
    return AgentKnowledgeChunkAdminPublic(
        id=c.id,
        source=c.source,
        title=c.title,
        content=c.content,
        created_at=c.created_at,
        embedding_ready=ready,
    )


@router.get("/chunks", response_model=AgentKnowledgeChunkList)
def list_knowledge_chunks(
    session: SessionDep,
    skip: int = 0,
    limit: int = Query(100, le=500),
) -> Any:
    count = session.exec(
        select(func.count()).select_from(AgentKnowledgeChunk)
    ).one()
    rows = list(
        session.exec(
            select(AgentKnowledgeChunk)
            .order_by(AgentKnowledgeChunk.created_at.desc())
            .offset(skip)
            .limit(limit)
        ).all()
    )
    return AgentKnowledgeChunkList(
        data=[_to_public(r) for r in rows],
        count=count,
    )


@router.post("/chunks", response_model=AgentKnowledgeChunkAdminPublic)
async def create_knowledge_chunk(
    session: SessionDep,
    body: AgentKnowledgeChunkCreate,
    reindex: bool = Query(
        True,
        description="Запросить эмбеддинг у inference (vLLM /v1/embeddings) сразу после создания",
    ),
) -> Any:
    chunk = AgentKnowledgeChunk(
        title=body.title,
        content=body.content,
        source=body.source or "manual",
    )
    session.add(chunk)
    session.commit()
    session.refresh(chunk)
    if reindex:
        await embed_chunk(session, chunk.id)
        session.refresh(chunk)
    return _to_public(chunk)


@router.patch("/chunks/{chunk_id}", response_model=AgentKnowledgeChunkAdminPublic)
async def update_knowledge_chunk(
    session: SessionDep,
    chunk_id: uuid.UUID,
    body: AgentKnowledgeChunkUpdate,
    reindex: bool = Query(True),
) -> Any:
    chunk = session.get(AgentKnowledgeChunk, chunk_id)
    if not chunk:
        raise HTTPException(status_code=404, detail="Фрагмент не найден")
    data = body.model_dump(exclude_unset=True)
    if not data:
        return _to_public(chunk)
    for k, v in data.items():
        setattr(chunk, k, v)
    if reindex:
        chunk.embedding = None
        chunk.embedding_vec = None
    session.add(chunk)
    session.commit()
    session.refresh(chunk)
    if reindex:
        await embed_chunk(session, chunk.id)
        session.refresh(chunk)
    return _to_public(chunk)


@router.delete("/chunks/{chunk_id}")
def delete_knowledge_chunk(
    session: SessionDep,
    chunk_id: uuid.UUID,
) -> dict[str, str]:
    chunk = session.get(AgentKnowledgeChunk, chunk_id)
    if not chunk:
        raise HTTPException(status_code=404, detail="Фрагмент не найден")
    session.delete(chunk)
    session.commit()
    return {"message": "Удалено"}


@router.post("/chunks/{chunk_id}/reindex", response_model=AgentKnowledgeChunkAdminPublic)
async def reindex_knowledge_chunk(
    session: SessionDep,
    chunk_id: uuid.UUID,
) -> Any:
    ok = await embed_chunk(session, chunk_id)
    if not ok:
        raise HTTPException(
            status_code=502,
            detail=(
                "Не удалось получить эмбеддинг (проверьте LLM_EMBEDDINGS_BASE_URL / "
                "LLM_OPENAI_BASE_URL / OLLAMA_BASE_URL, LLM_EMBEDDING_API_STYLE и LLM_EMBED_MODEL)"
            ),
        )
    chunk = session.get(AgentKnowledgeChunk, chunk_id)
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found after reindex")
    return _to_public(chunk)


@router.post("/chunks/reindex-all")
async def reindex_all_knowledge_chunks(
    session: SessionDep,
) -> dict[str, int]:
    ok, fail = await embed_all_chunks(session)
    return {"success": ok, "failed": fail}
