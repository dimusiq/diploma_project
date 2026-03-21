"""
Слоистая архитектура AI-агента склада.

Слои: llm_adapter, policy, tool_registry, planner, memory, trace (+ evaluation).
Точка входа для HTTP — `app.services.agent_chat.run_agent_chat`.
"""

from app.agent.llm_adapter import LlmTaskKind, ollama_configured, resolve_ollama_model

__all__ = [
    "LlmTaskKind",
    "ollama_configured",
    "resolve_ollama_model",
]
