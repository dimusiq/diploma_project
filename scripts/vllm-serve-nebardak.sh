#!/usr/bin/env bash
# Запуск vLLM в режиме OpenAI-совместимого API для проекта nebardak.
#
# Контракт: POST /v1/chat/completions с полем message.tool_calls (см. backend/app/agent/planner.py).
# Для Qwen3 см. https://qwen.readthedocs.io/en/stable/framework/function_call.html#vllm
# Требуется vLLM >= 0.8.5.
#
# Переменные окружения (опционально):
#   VLLM_MODEL                  — по умолчанию Qwen/Qwen3-8B-AWQ
#   VLLM_PORT                   — по умолчанию 8001 (как в docker-compose.override.yml)
#   VLLM_HOST                   — по умолчанию 0.0.0.0
#   VLLM_MAX_MODEL_LEN          — по умолчанию 1536 (~12GB VRAM)
#   VLLM_GPU_MEMORY_UTILIZATION — по умолчанию 0.92
#
# В .env backend/worker укажите базовый URL БЕЗ /v1:
#   VLLM_BASE_URL=http://localhost:8001
# Если API в Docker, а vLLM на хосте (Windows/macOS Docker Desktop):
#   VLLM_BASE_URL=http://host.docker.internal:8001
#
# Имена моделей должны совпадать:
#   VLLM_CHAT_MODEL=Qwen/Qwen3-8B-AWQ
#   VLLM_REASONING_MODEL=Qwen/Qwen3-8B-AWQ   # или отдельная модель при необходимости
#
# RAG: отдельно настройте VLLM_EMBED_MODEL и эмбеддинги (часто второй процесс или тот же хост с /v1/embeddings).

set -euo pipefail

MODEL="${VLLM_MODEL:-Qwen/Qwen3-8B-AWQ}"
PORT="${VLLM_PORT:-8001}"
HOST="${VLLM_HOST:-0.0.0.0}"
MAX_LEN="${VLLM_MAX_MODEL_LEN:-1536}"
GPU_MEM="${VLLM_GPU_MEMORY_UTILIZATION:-0.92}"

EXTRA=()
if [[ "${VLLM_ENFORCE_EAGER:-1}" == "1" ]]; then
  EXTRA+=(--enforce-eager)
fi

exec vllm serve "${MODEL}" \
  --host "${HOST}" \
  --port "${PORT}" \
  --trust-remote-code \
  --gpu-memory-utilization "${GPU_MEM}" \
  --max-model-len "${MAX_LEN}" \
  "${EXTRA[@]}" \
  --enable-auto-tool-choice \
  --tool-call-parser hermes \
  --reasoning-parser deepseek_r1 \
  --disable-log-stats \
  "$@"
