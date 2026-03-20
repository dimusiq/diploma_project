"""Чат-ассистент по складу: контекст БД, RAG, Ollama, инструменты (read-only)."""

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.permissions import PERM_AGENT_USE, can_use_agent
from app.services.agent_chat import run_agent_chat
from app.services.agent_rate_limit import enforce_agent_chat_rate_limit

router = APIRouter(prefix="/agent", tags=["agent"])


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)


class AgentChatResponse(BaseModel):
    reply: str
    ollama_available: bool
    model: str | None = None


class AgentPermissionsResponse(BaseModel):
    can_use: bool


@router.get("/permissions", response_model=AgentPermissionsResponse)
def agent_permissions(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Для UI: есть ли право пользоваться POST /agent/chat."""
    return AgentPermissionsResponse(can_use=can_use_agent(session, current_user))


@router.post(
    "/chat",
    response_model=AgentChatResponse,
    dependencies=[require_permission(PERM_AGENT_USE)],
)
async def agent_chat(
    session: SessionDep,
    current_user: CurrentUser,
    body: AgentChatRequest,
) -> Any:
    """
    Ответ на вопрос по складу. Контекст — агрегаты, layout, RAG по справочнику, инструменты (поиск товаров).
    Лимит запросов: `AGENT_CHAT_RATE_LIMIT_PER_MINUTE` (память процесса или Redis).
    """
    enforce_agent_chat_rate_limit(current_user.id)
    try:
        reply, ollama_ok, model = await run_agent_chat(
            session, current_user, body.message
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Ollama вернула ошибку: {e.response.status_code}",
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось обратиться к Ollama: {e!s}",
        ) from e

    return AgentChatResponse(reply=reply, ollama_available=ollama_ok, model=model)
