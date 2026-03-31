"""Персистентные чаты пользователя с ассистентом (сообщения в БД)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session, func, select

from app.models import AgentUserChat, AgentUserChatMessage
from app.models import User
from app.services.agent_chat import AgentChatOutcome


def _title_from_first_message(text: str) -> str:
    t = " ".join(text.strip().split())
    if not t:
        return "Новый чат"
    return f"{t[:50]}…" if len(t) > 50 else t


def get_user_chat_for_user(
    session: Session,
    *,
    chat_id: uuid.UUID,
    user: User,
) -> AgentUserChat | None:
    chat = session.get(AgentUserChat, chat_id)
    if chat is None or chat.user_id != user.id:
        return None
    return chat


def append_user_chat_turn(
    session: Session,
    *,
    chat_id: uuid.UUID,
    user_message: str,
    outcome: AgentChatOutcome,
    run_uuid: uuid.UUID | None,
    include_public_reasoning_in_meta: bool = True,
    assistant_reply_text: str | None = None,
) -> None:
    row = session.exec(
        select(func.max(AgentUserChatMessage.seq)).where(
            AgentUserChatMessage.chat_id == chat_id
        )
    ).first()
    max_seq = int(row) if row is not None else -1
    base = max_seq + 1

    u_msg = AgentUserChatMessage(
        chat_id=chat_id,
        seq=base,
        role="user",
        content=user_message,
    )
    session.add(u_msg)

    meta: dict[str, Any] = {
        "llm_available": outcome.llm_available,
        "model": outcome.model,
        "public_reasoning": (
            outcome.public_reasoning if include_public_reasoning_in_meta else None
        ),
        "run_id": str(run_uuid) if run_uuid else None,
    }
    assistant_body = assistant_reply_text if assistant_reply_text is not None else outcome.reply
    a_msg = AgentUserChatMessage(
        chat_id=chat_id,
        seq=base + 1,
        role="assistant",
        content=assistant_body,
        assistant_meta=meta,
    )
    session.add(a_msg)

    chat = session.get(AgentUserChat, chat_id)
    if chat is not None:
        now = datetime.now(timezone.utc)
        chat.updated_at = now
        if chat.title == "Новый чат" and user_message.strip():
            chat.title = _title_from_first_message(user_message)
        session.add(chat)
