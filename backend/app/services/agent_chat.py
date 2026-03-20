"""Оркестрация чата ассистента: контекст БД, RAG, вызов LLM с инструментами."""

from __future__ import annotations

from sqlmodel import Session

from app.core.config import settings
from app.models import User
from app.services.agent_context import build_warehouse_context_for_user
from app.services.agent_llm import complete_with_ollama_tools, ollama_configured
from app.services.agent_rag import build_rag_context_block, ollama_embed


async def run_agent_chat(session: Session, user: User, user_message: str) -> tuple[str, bool, str | None]:
    """
    Возвращает (reply, ollama_available, model_name).
    Без Ollama — текстовая сводка контекста + RAG (без эмбеддингов).
    """
    base_context = build_warehouse_context_for_user(session, user)
    query_embedding = await ollama_embed(user_message) if ollama_configured() else None
    rag_block = build_rag_context_block(session, user_message, query_embedding)

    if rag_block:
        context = f"{base_context}\n\nСправочные фрагменты (RAG):\n{rag_block}"
    else:
        context = base_context

    if ollama_configured():
        reply = await complete_with_ollama_tools(
            session=session,
            user=user,
            context_block=context,
            user_message=user_message,
        )
        return reply, True, settings.OLLAMA_MODEL

    fallback = (
        "Локальная модель (Ollama) не настроена. Задайте переменные окружения "
        "OLLAMA_BASE_URL (например http://host.docker.internal:11434) и при необходимости "
        "OLLAMA_MODEL.\n\n"
        f"Доступный контекст по вашим правам:\n\n{context}"
    )
    return fallback, False, None
