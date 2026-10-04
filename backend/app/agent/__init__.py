"""
Слоистая архитектура AI-агента склада.

Слои: llm_adapter, policy, tool_registry, structured_orchestrator,
tool_orchestrator (опц.), planner, memory, trace.
Точка входа для HTTP — `app.services.agent_chat.run_agent_chat`.
Целевой inference: vLLM (OpenAI-совместимый API).
"""

from app.agent.llm_adapter import (
    LlmTaskKind,
    llm_inference_configured,
    resolve_llm_model,
)

__all__ = [
    "LlmTaskKind",
    "llm_inference_configured",
    "resolve_llm_model",
]
