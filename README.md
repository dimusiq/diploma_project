# Склад

WMS / цифровой двойник склада: учёт товаров и ячеек, техника и персонал, заявки на ТО, симуляция устройств, аналитика twin и чат-ассистент с инструментами.

## Стек

- **Backend:** FastAPI, SQLModel, PostgreSQL (+ pgvector), Alembic, фоновый worker
- **Frontend:** React, TypeScript, Vite, Tailwind, shadcn-style UI (без Chakra / Emotion)
- **Realtime:** SSE/WebSocket (twin, items, notifications)
- **LLM (опционально):** OpenAI-совместимый API — целевой backend **vLLM** (`VLLM_BASE_URL`)
- **Инфра:** Docker Compose, Traefik, Pytest, Playwright

## Быстрый старт (Docker)

```bash
cp .env.example .env
# подставьте SECRET_KEY, пароли Postgres и суперпользователя

docker compose up --build -d
# или режим разработки:
docker compose watch
```

После запуска:

| Сервис | URL |
|--------|-----|
| Frontend | http://localhost:5173 |
| API / OpenAPI | http://localhost:8000/docs |
| Adminer | http://localhost:8080 |

Подробнее: [DOCKER.md](./DOCKER.md), [development.md](./development.md).

## Локальный backend без Docker

```bash
cd backend
uv sync
# Postgres должен быть доступен (см. .env: POSTGRES_*)
uv run alembic upgrade head
uv run fastapi run --reload app/main.py
```

Тесты:

```bash
cd backend
uv run pytest app/tests -q
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## vLLM / ассистент

1. Поднимите OpenAI-совместимый inference (vLLM и т.п.).
2. В `.env` задайте, например:

```env
VLLM_BASE_URL=http://host.docker.internal:8001
VLLM_CHAT_MODEL=Qwen/Qwen3-8B-AWQ
VLLM_EMBED_MODEL=...   # размерность вектора должна совпадать с agent_vector (часто 768)
LLM_EMBEDDING_API_STYLE=openai
```

3. Чат: `POST /api/v1/agent/chat` (право `agent.use`). Без URL LLM ассистент отдаёт fallback по контексту склада.

См. также раздел LLM в [development.md](./development.md).

## Документация

Индекс: [docs/README.md](./docs/README.md)

- [development.md](./development.md) — разработка, агент, twin, миграции
- [deployment.md](./deployment.md) — Traefik, домены, HTTPS
- [DOCKER.md](./DOCKER.md) — сборка и compose
- [backend/README.md](./backend/README.md) — backend / uv / отладка
- [frontend/README.md](./frontend/README.md) — UI

## Лицензия

См. файлы лицензии в репозитории (если присутствуют).
