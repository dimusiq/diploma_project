"""
Memory / Context Builder: оперативный контекст сессии, RAG, агрегаты склада.

Долгие диалоги: зарезервировано поле `history_summary` (пока одиночный вопрос за запрос).
"""

from __future__ import annotations

from typing import Any

from sqlmodel import Session

from app.agent.llm_adapter import ollama_configured
from app.models import User
from app.services.agent_context import build_warehouse_context_for_user
from app.services.agent_rag import build_rag_context_block, ollama_embed


async def build_chat_context(
    session: Session,
    user: User,
    user_message: str,
    *,
    history_summary: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """
    Собирает текстовый блок для policy/planner: склад + опционально сводка диалога + RAG.

    Второй элемент — метаданные для reasoning trace (источники данных, RAG).
    `user_message` должен быть уже обезличен (policy.redact_user_message), если нужна PII policy.
    """
    base_context = build_warehouse_context_for_user(session, user)
    lines = [base_context]

    meta: dict[str, Any] = {
        "warehouse_context": True,
        "history_summary": bool(history_summary and history_summary.strip()),
        "rag_chunks": 0,
        "rag_mode": "none",
        "embedding_model_used": False,
    }

    if history_summary and history_summary.strip():
        lines.append(f"Краткая сводка предыдущих реплик диалога:\n{history_summary.strip()}")

    query_embedding = None
    if ollama_configured():
        query_embedding = await ollama_embed(user_message)
        meta["embedding_model_used"] = query_embedding is not None

    rag_block, rag_meta = build_rag_context_block(session, user_message, query_embedding)
    meta["rag_chunks"] = rag_meta.get("rag_chunks", 0)
    meta["rag_mode"] = rag_meta.get("rag_mode", "none")
    if rag_block:
        lines.append(f"Справочные фрагменты (RAG):\n{rag_block}")

    return "\n\n".join(lines), meta
