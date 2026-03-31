"""
Типизированные ошибки контура агента: HTTP-маппинг и безопасные сообщения для клиента.

Внутренние детали (URL upstream, тело ответа, stack) — только в логах, не в API.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)


class AgentError(Exception):
    """Базовая ошибка агента с публичным кодом и безопасным текстом для клиента."""

    error_code: str = "agent_error"
    http_status: int = 500
    retryable: bool = False

    def __init__(
        self,
        public_message: str,
        *,
        run_id: str | None = None,
        internal_detail: str | None = None,
    ) -> None:
        super().__init__(public_message)
        self.public_message = public_message
        self.run_id = run_id
        self.internal_detail = internal_detail

    def client_detail(self) -> dict[str, Any]:
        return {
            "error_code": self.error_code,
            "message": self.public_message,
            "retryable": self.retryable,
            "run_id": self.run_id,
        }


class InferenceUpstreamError(AgentError):
    """HTTP/протокольные ошибки upstream inference (vLLM и т.п.)."""

    error_code = "agent_inference_upstream"
    http_status = 502
    retryable = True


class AgentContextBuildError(AgentError):
    """Сбор контекста (склад, RAG, память): БД и логика до вызова LLM."""

    error_code = "agent_context_build_failed"
    http_status = 500
    retryable = True


class ToolExecutionError(AgentError):
    """Критический сбой при выполнении инструмента (не JSON-ответ в чат)."""

    error_code = "agent_tool_execution_failed"
    http_status = 500
    retryable = False


class PolicyViolationError(AgentError):
    """Нарушение политики агента / контракта запроса."""

    error_code = "agent_policy_violation"
    http_status = 422
    retryable = False


class AgentUpstreamBadRequestError(AgentError):
    """Upstream вернул 400 по причинам, не связанным с «нет поддержки tools»."""

    error_code = "agent_upstream_bad_request"
    http_status = 502
    retryable = False


class AgentInternalError(AgentError):
    """Не классифицированная внутренняя ошибка приложения."""

    error_code = "agent_internal_error"
    http_status = 500
    retryable = False


def agent_error_to_http_exception(exc: AgentError) -> HTTPException:
    return HTTPException(
        status_code=exc.http_status,
        detail=exc.client_detail(),
    )


def log_httpx_upstream_error(
    exc: httpx.HTTPStatusError,
    *,
    run_id: str | None = None,
    log_body_max: int = 2000,
) -> None:
    """Полная диагностика в лог; клиенту не передавать."""
    req = exc.request
    url_s = str(req.url) if req else "(unknown)"
    status = exc.response.status_code if exc.response else 0
    snippet = ""
    try:
        snippet = (exc.response.text or "")[:log_body_max]
    except Exception:
        snippet = ""
    logger.warning(
        "agent_inference_upstream_http status=%s url=%s run_id=%s body_prefix=%r",
        status,
        url_s,
        run_id,
        snippet,
    )


def public_inference_http_exception(
    status_code: int,
    *,
    run_id: str | None = None,
) -> HTTPException:
    """Безопасный 502 для клиента после HTTP-ошибки upstream."""
    return HTTPException(
        status_code=502,
        detail={
            "error_code": "agent_inference_upstream_http",
            "message": "Сервис вывода (inference) вернул ошибку. Повторите запрос позже.",
            "retryable": True,
            "run_id": run_id,
            "upstream_status": status_code,
        },
    )


def public_inference_unreachable_exception(
    *,
    run_id: str | None = None,
) -> HTTPException:
    return HTTPException(
        status_code=502,
        detail={
            "error_code": "agent_inference_unreachable",
            "message": "Нет связи с сервисом вывода (inference). Повторите запрос позже.",
            "retryable": True,
            "run_id": run_id,
        },
    )


def _error_message_from_chat_completion_body(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    try:
        data = json.loads(t)
        err = data.get("error")
        if isinstance(err, dict):
            return str(err.get("message") or err.get("type") or "")
        if isinstance(err, str):
            return err
    except json.JSONDecodeError:
        pass
    return t[:500]


def chat_completion_400_implies_tools_unsupported(response: httpx.Response) -> bool:
    """
    Только при явных признаках «tools / tool_choice не поддерживаются» разрешаем text-only fallback.
    Иначе 400 трактуем как ошибку конфигурации/запроса upstream.
    """
    if response.status_code != 400:
        return False
    raw = response.text or ""
    msg = _error_message_from_chat_completion_body(raw).lower()
    blob = raw.lower()

    def _hay() -> str:
        return msg if msg else blob

    h = _hay()
    if not h.strip():
        return False

    tool_markers = (
        "tool",
        "tools",
        "tool_choice",
        "tool_calls",
        "function_call",
        "functions",
        "parallel_tool",
    )
    if not any(m in h for m in tool_markers):
        return False

    unsupported_markers = (
        "not support",
        "unsupported",
        "does not support",
        "do not support",
        "unknown parameter",
        "invalid parameter",
        "no endpoints found",
        "doesn't support",
        "cannot use tools",
        "tool use is not",
    )
    if any(m in h for m in unsupported_markers):
        return True

    if "tool_choice" in h and ("invalid" in h or "error" in h):
        return True

    # vLLM / строгие прокси: repetition_penalty или лишние поля
    if "repetition" in h and any(
        x in h for x in ("invalid", "unknown", "unexpected", "not support", "unsupported")
    ):
        return True

    return False


def sse_error_dict_from_exception(exc: BaseException) -> dict[str, Any]:
    """Единый JSON для SSE `type: error` (без утечки URL/тела upstream)."""
    if isinstance(exc, AgentError):
        return {"type": "error", **exc.client_detail()}
    if isinstance(exc, httpx.HTTPStatusError):
        log_httpx_upstream_error(exc)
        fe = public_inference_http_exception(exc.response.status_code)
        assert isinstance(fe.detail, dict)
        return {"type": "error", **fe.detail}
    if isinstance(exc, httpx.RequestError):
        fe = public_inference_unreachable_exception()
        assert isinstance(fe.detail, dict)
        return {"type": "error", **fe.detail}
    logger.exception("agent_sse_unclassified_error")
    return {
        "type": "error",
        "error_code": AgentInternalError.error_code,
        "message": "Внутренняя ошибка при обработке запроса ассистента.",
        "retryable": False,
        "run_id": None,
    }
