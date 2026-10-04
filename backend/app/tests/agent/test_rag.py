"""RAG/pgvector: keyword, fallback без эмбеддингов, vector_jsonb/pg, embed HTTP."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any
from unittest.mock import MagicMock

import httpx
import pytest
from sqlalchemy.exc import ProgrammingError

from app.core.agent_vector import AGENT_EMBEDDING_VECTOR_DIMENSIONS
from app.core.config import settings
from app.services import agent_rag
from app.services.agent_rag import (
    _cosine,
    _keyword_scores,
    _pgvector_top_chunks,
    _tokenize,
    build_rag_context_block,
    llm_embed_query,
)


def _chunk(
    *,
    title: str,
    content: str,
    embedding: list[float] | None = None,
    cid: uuid.UUID | None = None,
) -> MagicMock:
    c = MagicMock()
    c.id = cid or uuid.uuid4()
    c.title = title
    c.content = content
    c.embedding = embedding
    return c


def test_tokenize_and_keyword_ranking() -> None:
    a = _chunk(title="Зоны", content="приёмка и отгрузка")
    b = _chunk(title="Остатки", content="на складе 42 паллеты ABC")
    scored = _keyword_scores("сколько паллет на складе", [a, b])
    assert scored[0][1] is b
    assert scored[0][0] > scored[1][0]
    assert "паллет" in _tokenize("сколько паллет")


def test_cosine_identical_and_orthogonal() -> None:
    v = [1.0, 0.0, 0.0]
    assert _cosine(v, v) == pytest.approx(1.0)
    assert _cosine(v, [0.0, 1.0, 0.0]) == pytest.approx(0.0)
    assert _cosine([], [1.0]) == 0.0


def test_build_rag_keyword_fallback_without_embedding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Без query_embedding — режим keyword; релевантный чанк выше по score."""
    monkeypatch.setattr(settings, "AGENT_RAG_TOP_K", 2)
    hit = _chunk(title="Паллеты", content="на складе лежит 7 паллет")
    miss = _chunk(title="Камеры", content="видеонаблюдение периметра")
    session = MagicMock()
    session.exec.return_value.all.return_value = [miss, hit]

    block, meta = build_rag_context_block(session, "сколько паллет", None)
    assert meta["rag_mode"] == "keyword"
    assert meta["rag_chunks"] == 1
    assert "паллет" in block.lower()
    assert "UNTRUSTED_" in block
    # Полная выгрузка таблицы чанков (известный hotspot / N+1-смежный путь).
    session.exec.assert_called_once()


def test_build_rag_empty_and_db_error() -> None:
    session = MagicMock()
    session.exec.return_value.all.return_value = []
    block, meta = build_rag_context_block(session, "q", None)
    assert block == ""
    assert meta["rag_mode"] == "none"

    session2 = MagicMock()
    session2.exec.side_effect = ProgrammingError("stmt", {}, Exception("no table"))
    block2, meta2 = build_rag_context_block(session2, "q", None)
    assert block2 == ""
    assert meta2["rag_chunks"] == 0


def test_build_rag_vector_jsonb_when_pgvector_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "AGENT_RAG_TOP_K", 1)
    dim = AGENT_EMBEDDING_VECTOR_DIMENSIONS
    q = [1.0] + [0.0] * (dim - 1)
    near = _chunk(
        title="Near",
        content="векторный хит",
        embedding=list(q),
    )
    far = _chunk(
        title="Far",
        content="шум",
        embedding=[0.0] * dim,
    )
    session = MagicMock()
    session.exec.return_value.all.return_value = [far, near]
    monkeypatch.setattr(agent_rag, "_pgvector_top_chunks", lambda *_a, **_k: [])

    block, meta = build_rag_context_block(session, "unused", q)
    assert meta["rag_mode"] == "vector_jsonb"
    assert meta["rag_chunks"] == 1
    assert "векторный хит" in block


def test_build_rag_vector_pg_and_get_per_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """pgvector SELECT id + session.get на каждый id (N+1 после списка id)."""
    monkeypatch.setattr(settings, "AGENT_RAG_TOP_K", 3)
    dim = AGENT_EMBEDDING_VECTOR_DIMENSIONS
    q = [0.0] * dim
    c1 = _chunk(title="A", content="one")
    c2 = _chunk(title="B", content="two")
    ids = [c1.id, c2.id]

    session = MagicMock()
    session.exec.return_value.all.return_value = [c1, c2]
    result = MagicMock()
    result.__iter__ = lambda self: iter([(ids[0],), (ids[1],)])
    session.execute.return_value = result
    session.get.side_effect = lambda _model, cid: {c1.id: c1, c2.id: c2}.get(cid)

    block, meta = build_rag_context_block(session, "q", q)
    assert meta["rag_mode"] == "vector_pg"
    assert meta["rag_chunks"] == 2
    assert session.get.call_count == 2
    assert "one" in block and "two" in block


def test_pgvector_top_chunks_swallows_sql_errors() -> None:
    session = MagicMock()
    session.execute.side_effect = ProgrammingError("stmt", {}, Exception("no vector"))
    out = _pgvector_top_chunks(
        session, [0.0] * AGENT_EMBEDDING_VECTOR_DIMENSIONS, k=3
    )
    assert out == []


def test_llm_embed_query_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "AGENT_RAG_EMBEDDING_HTTP_ENABLED", False)
    assert asyncio.run(llm_embed_query("hello")) is None


def test_llm_embed_query_openai_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "AGENT_RAG_EMBEDDING_HTTP_ENABLED", True)
    monkeypatch.setattr(settings, "LLM_EMBEDDING_API_STYLE", "openai")
    monkeypatch.setattr(
        agent_rag, "resolve_llm_embeddings_base_url", lambda: "http://embed"
    )
    monkeypatch.setattr(agent_rag, "resolve_llm_model", lambda _k: "emb-model")

    vec = [0.1] * AGENT_EMBEDDING_VECTOR_DIMENSIONS

    class _Client:
        def __init__(self, *a: Any, **k: Any) -> None:
            pass

        async def __aenter__(self) -> _Client:
            return self

        async def __aexit__(self, *a: Any) -> None:
            return None

        async def post(self, url: str, *, json: dict[str, Any]) -> httpx.Response:
            assert url.endswith("/v1/embeddings")
            assert json["model"] == "emb-model"
            return httpx.Response(
                200,
                json={"data": [{"embedding": vec}]},
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr(httpx, "AsyncClient", _Client)
    out = asyncio.run(llm_embed_query("query text"))
    assert out is not None
    assert len(out) == AGENT_EMBEDDING_VECTOR_DIMENSIONS


def test_llm_embed_query_wrong_dimensions(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "AGENT_RAG_EMBEDDING_HTTP_ENABLED", True)
    monkeypatch.setattr(settings, "LLM_EMBEDDING_API_STYLE", "openai")
    monkeypatch.setattr(
        agent_rag, "resolve_llm_embeddings_base_url", lambda: "http://embed"
    )
    monkeypatch.setattr(agent_rag, "resolve_llm_model", lambda _k: "emb-model")

    class _Client:
        def __init__(self, *a: Any, **k: Any) -> None:
            pass

        async def __aenter__(self) -> _Client:
            return self

        async def __aexit__(self, *a: Any) -> None:
            return None

        async def post(self, url: str, *, json: dict[str, Any]) -> httpx.Response:
            _ = json
            return httpx.Response(
                200,
                json={"data": [{"embedding": [1.0, 2.0]}]},
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr(httpx, "AsyncClient", _Client)
    assert asyncio.run(llm_embed_query("q")) is None
