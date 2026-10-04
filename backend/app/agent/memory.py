"""
Memory / Context Builder: оперативный контекст сессии, RAG, агрегаты склада.

Долгие диалоги: `history_summary` и блок памяти операционной сессии (`operation_memory_block`).
Сервисы подгружаются lazy внутри функций — без import-cycle agent.memory ↔ services.
"""

from __future__ import annotations

import asyncio
from typing import Any

from sqlmodel import Session

from app.agent.llm_adapter import llm_inference_configured
from app.agent.untrusted import wrap_untrusted
from app.models import User


def _assemble_sync_context(
    session: Session,
    user: User,
    user_message: str,
    *,
    history_summary: str | None,
    operation_memory_block: str | None,
    query_embedding: list[float] | None,
) -> tuple[str, dict[str, Any]]:
    """Синхронная сборка (ORM) — вызывается из threadpool, чтобы не блокировать loop."""
    from app.services.agent_context import (
        build_historical_domain_events_block,
        build_twin_queue_depth_snapshot_block,
        build_warehouse_context_for_user,
    )
    from app.services.agent_rag import build_rag_context_block

    base_context = build_warehouse_context_for_user(session, user)
    lines = [base_context]

    meta: dict[str, Any] = {
        "warehouse_context": True,
        "history_summary": bool(history_summary and history_summary.strip()),
        "operation_session_memory": bool(
            operation_memory_block and operation_memory_block.strip()
        ),
        "rag_chunks": 0,
        "rag_mode": "none",
        "embedding_model_used": query_embedding is not None,
        "historical_domain_events": False,
        "domain_events_24h_total": None,
        "domain_events_top_types_7d": 0,
        "twin_queue_projections": False,
        "twin_queue_projection_rows": 0,
    }

    twin_block, twin_meta = build_twin_queue_depth_snapshot_block(session)
    meta.update(twin_meta)
    if twin_block:
        lines.append(twin_block)

    if operation_memory_block and operation_memory_block.strip():
        lines.append(
            wrap_untrusted(
                "operation_memory",
                operation_memory_block.strip(),
                source="operation_session",
            )
        )

    if history_summary and history_summary.strip():
        lines.append(
            "Краткая сводка предыдущих реплик диалога:\n"
            + wrap_untrusted("history_summary", history_summary.strip())
        )

    hist_block, hist_meta = build_historical_domain_events_block(session, user)
    meta.update(hist_meta)
    if hist_block:
        lines.append(hist_block)

    rag_block, rag_meta = build_rag_context_block(
        session, user_message, query_embedding
    )
    meta["rag_chunks"] = rag_meta.get("rag_chunks", 0)
    meta["rag_mode"] = rag_meta.get("rag_mode", "none")
    if rag_block:
        lines.append(f"Справочные фрагменты (RAG):\n{rag_block}")

    return "\n\n".join(lines), meta


async def build_chat_context(
    session: Session,
    user: User,
    user_message: str,
    *,
    history_summary: str | None = None,
    operation_memory_block: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """
    Собирает текстовый блок для policy/planner: склад, срез истории событий (при правах),
    опционально сводка диалога и RAG.

    Второй элемент — метаданные для reasoning trace (источники данных, RAG, сессия операций).
    `user_message` должен быть уже обезличен (policy.redact_user_message), если нужна PII policy.

    ORM/SQL выполняется в threadpool; HTTP-эмбеддинги — в async.
    """
    from app.services.agent_rag import llm_embed_query

    query_embedding = None
    if llm_inference_configured():
        query_embedding = await llm_embed_query(user_message)

    return await asyncio.to_thread(
        _assemble_sync_context,
        session,
        user,
        user_message,
        history_summary=history_summary,
        operation_memory_block=operation_memory_block,
        query_embedding=query_embedding,
    )
