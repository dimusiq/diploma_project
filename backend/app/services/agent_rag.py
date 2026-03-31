"""RAG: справочные фрагменты из БД — keyword + опционально эмбеддинги через OpenAI/vLLM API."""

from __future__ import annotations

import math
import re
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError, SQLAlchemyError
from sqlmodel import Session, select

from app.agent.llm_adapter import (
    LlmTaskKind,
    resolve_llm_embeddings_base_url,
    resolve_llm_model,
)
from app.core.agent_vector import AGENT_EMBEDDING_VECTOR_DIMENSIONS
from app.core.config import settings
from app.models import AgentKnowledgeChunk


def _tokenize(text: str) -> set[str]:
    return {
        m.group(0).lower()
        for m in re.finditer(r"[A-Za-zА-Яа-яЁёІіЇїЄє0-9]{2,}", text)
    }


def _keyword_scores(query: str, chunks: list[AgentKnowledgeChunk]) -> list[tuple[float, AgentKnowledgeChunk]]:
    q = _tokenize(query)
    if not q:
        return [(0.0, c) for c in chunks]
    scored: list[tuple[float, AgentKnowledgeChunk]] = []
    for c in chunks:
        blob = f"{c.title} {c.content}".lower()
        hits = sum(1 for w in q if w in blob)
        scored.append((float(hits), c))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored


def _cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


async def llm_embed_query(text: str) -> list[float] | None:
    if not settings.AGENT_RAG_EMBEDDING_HTTP_ENABLED:
        return None
    base = resolve_llm_embeddings_base_url()
    if not base:
        return None
    model = resolve_llm_model(LlmTaskKind.EMBEDDING)
    if not model:
        return None
    style = settings.LLM_EMBEDDING_API_STYLE
    timeout = httpx.Timeout(60.0, connect=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if style == "openai":
                url = f"{base}/v1/embeddings"
                payload: dict[str, Any] = {
                    "model": model,
                    "input": text[:8000],
                }
                r = await client.post(url, json=payload)
                r.raise_for_status()
                data = r.json()
                rows = data.get("data")
                if not isinstance(rows, list) or not rows:
                    return None
                emb = rows[0].get("embedding") if isinstance(rows[0], dict) else None
            else:
                url = f"{base}/api/embeddings"
                payload = {"model": model, "prompt": text[:8000]}
                r = await client.post(url, json=payload)
                r.raise_for_status()
                data = r.json()
                emb = data.get("embedding")
    except (httpx.HTTPError, ValueError, KeyError, TypeError, IndexError):
        return None
    if not isinstance(emb, list):
        return None
    out: list[float] = []
    for x in emb:
        if isinstance(x, (int, float)):
            out.append(float(x))
        else:
            return None
    if len(out) != AGENT_EMBEDDING_VECTOR_DIMENSIONS:
        return None
    return out


async def ollama_embed(text: str) -> list[float] | None:
    """Устаревшее имя: то же, что llm_embed_query."""
    return await llm_embed_query(text)


def _vector_literal(vec: list[float]) -> str:
    return "[" + ",".join(str(float(x)) for x in vec) + "]"


def _pgvector_top_chunks(
    session: Session, query_embedding: list[float], k: int
) -> list[AgentKnowledgeChunk]:
    if len(query_embedding) != AGENT_EMBEDDING_VECTOR_DIMENSIONS:
        return []
    lit = _vector_literal(query_embedding)
    try:
        r = session.execute(
            text(
                """
                SELECT id FROM agent_knowledge_chunk
                WHERE embedding_vec IS NOT NULL
                ORDER BY embedding_vec <=> CAST(:qv AS vector)
                LIMIT :k
                """
            ),
            {"qv": lit, "k": k},
        )
        ids = [row[0] for row in r]
    except (ProgrammingError, SQLAlchemyError):
        return []
    out: list[AgentKnowledgeChunk] = []
    for cid in ids:
        c = session.get(AgentKnowledgeChunk, cid)
        if c:
            out.append(c)
    return out


def build_rag_context_block(
    session: Session, user_query: str, query_embedding: list[float] | None
) -> tuple[str, dict[str, Any]]:
    meta: dict[str, Any] = {"rag_chunks": 0, "rag_mode": "none"}
    try:
        chunks = list(session.exec(select(AgentKnowledgeChunk)).all())
    except SQLAlchemyError:
        return "", meta
    if not chunks:
        return "", meta

    top_k = max(1, min(settings.AGENT_RAG_TOP_K, 10))
    selected: list[AgentKnowledgeChunk] = []
    mode = "none"

    if query_embedding:
        pv = _pgvector_top_chunks(session, query_embedding, top_k)
        if pv:
            selected = pv
            mode = "vector_pg"
        else:
            scored_emb: list[tuple[float, AgentKnowledgeChunk]] = []
            for c in chunks:
                if c.embedding and isinstance(c.embedding, list):
                    emb = [float(x) for x in c.embedding if isinstance(x, (int, float))]
                    if len(emb) == len(query_embedding):
                        scored_emb.append((_cosine(query_embedding, emb), c))
            scored_emb.sort(key=lambda x: x[0], reverse=True)
            if scored_emb and scored_emb[0][0] > 0.05:
                selected = [c for _, c in scored_emb[:top_k]]
                mode = "vector_jsonb"
    if not selected:
        kw = _keyword_scores(user_query, chunks)
        qtok = _tokenize(user_query)
        if qtok:
            selected = [c for s, c in kw[:top_k] if s > 0]
        if not selected and kw:
            selected = [c for _, c in kw[:top_k]]
        if selected:
            mode = "keyword"

    if not selected:
        return "", meta

    meta["rag_chunks"] = len(selected)
    meta["rag_mode"] = mode
    parts = []
    for c in selected:
        parts.append(f"### {c.title}\n{c.content}")
    return "\n\n".join(parts), meta
