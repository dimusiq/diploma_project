# Backend («Склад»)

FastAPI + SQLModel + PostgreSQL (pgvector). Модели — пакет `app/models/`, API — `app/api/`, агент — `app/agent/` + `app/services/agent_*.py`, симулятор устройств — `app/warehouse_sim/`.

## Требования

- [Docker](https://www.docker.com/) (рекомендуется полный стек) или локальный Postgres 16 + pgvector
- [uv](https://docs.astral.sh/uv/)

## Быстрый старт

Из корня репозитория: см. [../DOCKER.md](../DOCKER.md) и [../development.md](../development.md).

Локально:

```bash
cd backend
uv sync
source .venv/bin/activate   # Windows: .venv\Scripts\activate
uv run alembic upgrade head
uv run fastapi run --reload app/main.py
```

Тесты:

```bash
uv run pytest app/tests -q
```

Линт (как в CI `.github/workflows/lint-backend.yml`):

```bash
uv run bash scripts/lint.sh
# = mypy app --no-incremental && ruff check app --no-cache && ruff format app --check
```

**Прод-риск индексов `wsim_event` (`cc9d0e1f2a3b`):** см. раздел «Миграции» в [../development.md](../development.md) — `CREATE INDEX` без `CONCURRENTLY` блокирует запись; `pg_trgm` лучше создать заранее под суперпользователем.

## Полезные пути

| Путь | Назначение |
|------|------------|
| `app/models/` | SQLModel-таблицы и схемы API |
| `app/api/routes/` | HTTP-эндпоинты |
| `app/agent/` | LLM adapter, policy, tools, orchestrator |
| `app/warehouse_sim/` | Warehouse Device Server (симуляция) |
| `app/alembic/` | Миграции |
| `scripts/` | lint, export OpenAPI, pre-start |

OpenAPI → фронт: `uv run python scripts/export_openapi_json.py` (результат в `frontend/openapi.json`).
