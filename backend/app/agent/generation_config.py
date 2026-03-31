"""
Жёсткая конфигурация сэмплинга для основного агента (совпадает с Settings / vLLM payload).
Единая точка для structured orchestrator и документации.
"""

from __future__ import annotations

from typing import Any

from app.agent.llm_adapter import LlmTaskKind, agent_chat_sampling_openai_fields


def generation_config_openai(task_kind: LlmTaskKind) -> dict[str, Any]:
    """Параметры как в OpenAI chat/completions (temperature, top_p, max_tokens, repetition_penalty)."""
    return dict(agent_chat_sampling_openai_fields(task_kind))
