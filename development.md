# FastAPI Project - Development

## Docker Compose

* Start the local stack with Docker Compose:

```bash
docker compose watch
```

* Now you can open your browser and interact with these URLs:

Frontend, built with Docker, with routes handled based on the path: http://localhost:5173

Backend, JSON based web API based on OpenAPI: http://localhost:8000

Automatic interactive documentation with Swagger UI (from the OpenAPI backend): http://localhost:8000/docs

Adminer, database web administration: http://localhost:8080

Redis (брокер/блокировки для фоновых задач): `localhost:6379`.

**LLM / inference (отдельный сервис от API, по умолчанию vLLM):**

- В `.env` у backend/worker задайте **базовый URL** (приоритет): **`VLLM_BASE_URL`**, затем **`LLM_OPENAI_BASE_URL`**, затем legacy **`OLLAMA_BASE_URL`**. Из Docker Desktop на Windows к vLLM на хосте: `http://host.docker.internal:8000` (порт — как у вашего сервера).
- Контракт **OpenAI**: `POST /v1/chat/completions`, для RAG — **`POST /v1/embeddings`**. Модели: **`VLLM_CHAT_MODEL`** / `LLM_CHAT_MODEL` / `OLLAMA_MODEL`; эмбеддинги: **`VLLM_EMBED_MODEL`** / `LLM_EMBED_MODEL` / `OLLAMA_EMBED_MODEL`. По умолчанию **`LLM_EMBEDDING_API_STYLE=openai`**; для Ollama `/api/embeddings` — **`ollama`**. Размерность вектора должна совпадать с **`app/core/agent_vector.py`** (часто **768**).
- Опционально другой хост только для эмбеддингов: **`LLM_EMBEDDINGS_BASE_URL`**.
- Readiness: `GET /api/v1/utils/readiness` проверяет LLM через **`/v1/models`** или **`/api/tags`** (Ollama).

Фоновый **worker** (планировщик email-отчётов вынесен из API при `RUN_REPORT_SCHEDULER_IN_API=false`):

```bash
docker compose logs -f worker
```

Локально без Docker: `cd backend && uv run python -m app.worker` (нужны Postgres, опционально `REDIS_URL` для распределённой блокировки).

Read-модель занятости ячеек (проекция для twin/KPI): `GET /api/v1/warehouse/occupancy` (легковесный список `slot_key` → `item_id`). Полный пересчёт в фоне — воркер раз в час; при CRUD товаров проекция обновляется в той же транзакции.

**Spec layout (schema-driven JSON v1):** поле **`warehouse_layout.spec`** описывается моделью **`WarehouseLayoutSpecV1`** (`app/schemas/warehouse_layout_spec.py`): **`schema_version`**, вложенная **`geometry`** (rows, levels, cellX, cellZ, …), опционально **`topology`** (тот же `TopologyDocument`), **`extensions`**. В API **`GET /api/v1/warehouse/layout`** отдаёт **плоский** `spec` (геометрия на верхнем уровне + `schema_version` + `topology`) для совместимости с 3D. Колонка **`spec_schema_version`** дублирует версию схемы для запросов. Жизненный цикл ревизии: **`lifecycle_status`** `draft` → **`published`** (`published_at`) → опционально **`archived`**; **`activated_at`** — когда ревизия стала **`is_active`**. Эндпоинты: **`GET /api/v1/warehouse/layouts`**, **`POST .../layout/{id}/publish|activate|archive`**, **`POST /api/v1/warehouse/layout/fork-draft`** (копия в черновик, `version = max+1` по code+warehouse_id; тело опционально `{"source_layout_id": "…"}` — иначе берётся активный layout). При **`activate`** обновляется **`warehouse.active_layout_id`** (для layout с **`warehouse_id`** — только этот склад; если **`warehouse_id` у layout пустой — все склады в таблице). Граф маршрутов: **`route_node` / `route_edge`** с **`warehouse_layout_id`**; **`GET /api/v1/warehouse/route-graph`**; **`POST /api/v1/warehouse/layout/{id}/sync-route-graph`** или **`POST /api/v1/warehouse/topology/sync-route-graph`** (тело `{"warehouse_layout_id": null}` = активный) — пересборка графа из проходов и доков топологии (`app/services/warehouse_route_graph_sync.py`).

**Топология склада (зоны, проходы, буферы, доки):** внутри spec как **`topology`** (`schema_version: 1` внутри документа топологии). API: **`GET /api/v1/warehouse/topology`**, **`PUT`** (право **`zones.manage`**), **`POST /api/v1/warehouse/topology/reset-defaults`**. В админке — кнопка «Синхронизировать граф маршрутов».

**3D digital twin (`/warehouse-3d`):** полупрозрачные **зоны** из **`topology.zones`**, полилинии **проходов** (`aisles.polyline_norm` → мир), **граф маршрутов** (`GET /api/v1/warehouse/route-graph`, узлы с `x_norm`/`z_norm`). Режимы наложения: занятость + зоны, **heatmap** нагрузки (загруженность рядов / остаток в ячейке / SLA по сроку), пополнение, аномалии (подсветка **резерв** `status=shipment`, **карантин** incoming/текст, **блок** — ячейки в рядах из `buffer_zones`), техника + граф (схематичные маркеры по списку **`/api/v1/equipment`** до появления `vehicle_position`). **Слайдер времени** — локальные снимки списка товаров. Логика: `twin3dDerived.ts`, слои: `WarehouseTwinLayers.tsx`, проп **`twinEnrichment`** у **`WarehouseScene`**.

**Реляционная модель WMS (миграция `r8s9t0u1v2w3`):** корень — таблица **`warehouse`** (склад `code`, опционально **`active_layout_id`** → `warehouse_layout` для привязки 3D). У `warehouse_layout` опционально **`warehouse_id`**. Справочник **`warehousezone`** привязан к складу (уникальность имени в разрезе `warehouse_id`); миграция создаёт склад `default` и переносит существующие зоны на него. Дополнительно: **`warehouse_aisle`**, **`warehouse_rack`**, **`storage_bin`**, **`staging_area`**, **`dock_door`**, **`route_node`** / **`route_edge`**, **`handling_unit`**, **`pallet`**, **`inventory_lot`**, **`shipment`**, **`inbound_order`** / **`outbound_order`**, **`warehouse_task`** / **`task_execution`**, **`inventory_snapshot`**, **`sensor_reading`**, **`vehicle_position`**. REST для этих сущностей кроме зон пока не обязателен — таблицы под будущие API и синхронизацию с twin.

**Доменные события и transactional outbox:** таблица **`domain_event`** (монотонный **`event_seq`**, **`payload_schema_version`**, JSON **`payload`**). Эмиссия **`emit_domain_event`** (`app/services/domain_events.py`) в той же транзакции создаёт строку **`event_outbox`**. Воркер (`app/worker/outbox_loop.py`) вызывает **`process_outbox_batch`**: для каждой пары потребитель + событие — вставка в **`projection_consumer_processed`** с идемпотентностью (claim через **`INSERT … ON CONFLICT DO NOTHING RETURNING`**), затем обработчик из **`app/projections/consumers.py`** (сейчас **`twin_timeline`** → **`twin_projection_entry`**). Каталог типов и v1 payload: **`app/events/catalog.py`**, **`app/events/payloads_v1.py`**, нормализация — **`app/events/registry.py`**. Полный пересбор проекций: **`POST /api/v1/projections/replay`** (право **`audit.read`**, тело см. OpenAPI); лента для twin: **`GET /api/v1/projections/twin-feed`**. После миграции старые события могут быть уже помечены доставленными в outbox — для наполнения **`twin_projection_entry`** историей вызовите replay при необходимости.

**Real-time twin (единый поток):** **`GET /api/v1/twin/stream`** (SSE) и **`WS /api/v1/twin/ws`** — query **`channels`** (через запятую; пусто или **`*`** = все) и **`replay_seconds`** (0–600, по умолчанию 120): при подключении отдаётся **replay** из ring-buffer, затем live. Каналы: **`occupancy`**, **`item_movement`**, **`task_updates`**, **`equipment_positions`**, **`alerts`**, **`agent_runs`**. Тело события: **`v`**, **`channel`**, **`type`**, **`ts`**, **`payload`**. Coalesce на сервере для высокочастотных каналов — **`app/realtime/twin_stream_hub.py`**; публикации из CRUD товаров, уведомлений, агента, воркера пересчёта занятости. Список каналов: **`GET /api/v1/twin/channels`**. Фронт: **`useTwinRealtime()`** в layout. Легаси: после `POST/PUT/DELETE` товара по-прежнему шлётся **`items_updated`** на **`GET /api/v1/items/stream`** и **`WS /api/v1/items/ws`** — при необходимости можно оставить только twin. Хаб в памяти процесса: при **нескольких репликах API** нужен общий брокер (Redis Pub/Sub и т.д.).

Чат-ассистент по складу: **`POST /api/v1/agent/chat`** (`{"message":"..."}`), **`GET /api/v1/agent/permissions`** (`can_use` для UI). Нужно право **`agent.use`** (по умолчанию у ролей admin, manager, warehouse, viewer). Лимит запросов: **`AGENT_CHAT_RATE_LIMIT_PER_MINUTE`** (по умолчанию 30/мин на пользователя; в памяти API-процесса, при **`REDIS_URL`** — через Redis). Контекст: агрегаты склада по правам, **RAG** из таблицы `agent_knowledge_chunk` (keyword; векторный поиск через **pgvector** при наличии колонки `embedding_vec` и эмбеддинга запроса; иначе JSONB/keyword), **инструмент** `search_items_in_warehouse` (read-only, с теми же границами, что у пользователя). Размерность эмбеддингов: **768** (`app/core/agent_vector.py`; модели см. **`VLLM_EMBED_MODEL`** / `LLM_EMBED_MODEL` / `OLLAMA_EMBED_MODEL`). LLM: **`VLLM_BASE_URL`** (приоритет), **`LLM_OPENAI_BASE_URL`**, **`OLLAMA_BASE_URL`**. Эмбеддинги: **`LLM_EMBEDDINGS_BASE_URL`** (опц.), **`LLM_EMBEDDING_API_STYLE`** `openai` | `ollama`. Без настроенного URL — текстовая сводка контекста (+ RAG keyword). Миграции: `alembic upgrade head`. Страница **`/assistant`** в меню видна только при `can_use`.

**Слои AI-агента** (пакет **`app/agent`**, оркестрация — **`app/services/agent_chat.py`**): **LLM adapter** (`llm_adapter.py`) — OpenAI-совместимый `/v1/chat/completions` к **`VLLM_BASE_URL`** / **`LLM_OPENAI_BASE_URL`** / **`OLLAMA_BASE_URL`**; выбор модели по **`LlmTaskKind`** (`CHAT`, `REASONING` → опционально **`VLLM_REASONING_MODEL`** / `LLM_REASONING_MODEL` / **`OLLAMA_MODEL_REASONING`**, `EMBEDDING` → env эмбед-модели). **Policy** (`policy.py`) — системный промпт, подсказка формата ответа, **redaction** email/телефона перед LLM. **Tool registry** (`tool_registry.py`) — версии и схемы инструментов, проверка права на вызов (сейчас все tools завязаны на **`agent.use`**). **Planner** (`planner.py`) — цикл chat + tool_calls с лимитом **`AGENT_MAX_TOOL_STEPS`**, таймаут **`AGENT_LLM_TIMEOUT_SEC`**, обработка ошибок инструментов и откат, если модель не поддерживает tools (HTTP 400). **Memory** (`memory.py`) — сборка контекста склада + RAG (+ заготовка под сводку длинного диалога). **Trace / audit** (`trace.py`) — шаги прогона в логгер **`app.agent.audit`** (JSON); **evaluation** (`evaluation.py`) — заготовки под скоринг и offline benchmark. Фасад для старых импортов: **`app/services/agent_llm.py`**.

**Reasoning / несколько моделей:** эмбеддинги — env эмбед-модели (RAG); основной цикл с tools — chat-модель из env (`VLLM_CHAT_MODEL` / …), либо отдельная **reasoning** модель (`VLLM_REASONING_MODEL` / `LLM_REASONING_MODEL` / `OLLAMA_MODEL_REASONING`); опционально **router** — `VLLM_ROUTER_MODEL` / `LLM_ROUTER_MODEL` / **`OLLAMA_MODEL_ROUTER`**. Структурированный trace: **`StructuredReasoningRun`** + запись в **`AgentTrace.internal_reasoning`** и лог **`app.agent.audit`**. Клиенту отдаётся **`public_reasoning`** (краткое объяснение, список tools, источники данных, итог, использованные модели) без полного CoT; полный trace — только **`include_reasoning_debug: true`** в **`POST /agent/chat`** и только **суперпользователь**.

**Каталог инструментов** (`app/agent/tool_catalog.py`, исполнение — **`app/services/agent_tools_handlers.py`**): read-only (`get_inventory_summary`, `find_item_by_sku`, `get_item_location`, `get_slot_state`, `list_zone_congestion`, `get_expiring_inventory`, `get_open_tasks`, `get_equipment_status`, `get_recent_events` при **`audit.read`**, `search_sop_documents`, `get_layout_topology`, `run_what_if_simulation`, плюс `search_items_in_warehouse`); act (`create_transfer_task`, `reserve_slot`, `create_cycle_count_task`, `reassign_pick_task`, `create_maintenance_request`, `acknowledge_alert`, `schedule_replenishment`); admin-only для суперпользователя (`publish_layout_version`, `rebuild_projection`, `reindex_knowledge`, `sync_external_system`). Класс **`ToolSafetyClass`**: `read` / `propose` / `act` — в каталоге мутации помечены как **`act`**; при **`AGENT_SANDBOX_MODE=true`** (по умолчанию) act не пишет в БД (ответ `sandbox`). Реальная запись: суперпользователь + тело **`allow_mutating_tools: true`** и **`AGENT_SANDBOX_MODE=false`**. Лог вызовов инструментов: логгер **`app.agent.tools`** (run_id, actor, превью входа/выхода). Произвольный SQL/shell агенту недоступен — только ORM-обработчики.

**Postgres в Docker**: образ **`pgvector/pgvector:pg16`** (расширение `vector`, индекс HNSW для RAG). Переход с **`postgres:12`**: том данных несовместим по мажорной версии — сделайте дамп/restore или новый volume (осторожно: `docker compose down -v` удаляет данные).

Если **`nebardak-db-1` сразу выходит с кодом 1** и в логах: *«The data directory was initialized by PostgreSQL version 12, which is not compatible with this version 16»* — удалите только том БД и поднимите стек снова (данные в БД пропадут, если не делали `pg_dump`):

```bash
docker compose down
docker volume rm nebardak_app-db-data
docker compose up -d
```

Имя тома совпадает с префиксом проекта Compose (часто `nebardak_`); проверка: `docker volume ls | grep app-db`.

**База знаний ассистента** (только **суперпользователь**): `GET/POST/PATCH/DELETE /api/v1/agent/knowledge/chunks`, `POST /api/v1/agent/knowledge/chunks/{id}/reindex`, `POST /api/v1/agent/knowledge/chunks/reindex-all`. В админке вкладка «База знаний ассистента».

**Аналитика цифрового двойника** (без LLM): **`GET /api/v1/warehouse/twin/summary`** — товары на складе по рядам, сроки годности (30 дней), занятость ячеек и доля от ёмкости layout, сводка **доменных событий за 7 дней** (только при праве **`audit.read`**; иначе блок событий пустой). Метрики товаров/ячеек — в границах прав пользователя (как список товаров). **`POST /api/v1/warehouse/twin/what-if`** — сценарий «что если» по тем же метрикам (тело запроса см. OpenAPI). При проверке уведомлений (`GET /api/v1/notifications/ensure`) создаются предупреждения по порогам **`TWIN_NOTIFICATION_ROW_ITEMS_MIN`** (по умолчанию 30 позиций в одном ряду) и **`TWIN_NOTIFICATION_UTILIZATION_MIN`** (доля занятости ячеек, по умолчанию 0.9). UI: **`/warehouse-twin`** («Аналитика двойника» в меню).

**Журнал чата ассистента**: **`GET /api/v1/agent/chat/logs`** (только суперпользователь). В админке — вкладка «Журнал чата ассистента».

**Бэкап Postgres** (из корня репо, контейнер `db` как в Compose): `scripts/backup_postgres.sh` — пишет сжатый дамп в `./backups/`.

**OpenAPI → фронт**: из каталога `backend` выполнить `uv run python scripts/export_openapi_json.py` (файл попадает в `frontend/openapi.json`). После **`npm run generate-client`** проверяйте сборку: корневой `src/client/client.gen.ts` должен брать **`ClientOptions`** из `./client`, а не из корневого `types.gen.ts` (иначе возможны ошибки TypeScript).

**Миграции**: для метрик twin и фильтра «товар на складе» в БД нужна колонка **`item.status`** (ревизия Alembic **`q5r6s7t8u9v0`**). После `git pull` всегда **`alembic upgrade head`** перед тестами и локальным API.

Traefik UI, to see how the routes are being handled by the proxy: http://localhost:8090

**Note**: The first time you start your stack, it might take a minute for it to be ready. While the backend waits for the database to be ready and configures everything. You can check the logs to monitor it.

To check the logs, run (in another terminal):

```bash
docker compose logs
```

To check the logs of a specific service, add the name of the service, e.g.:

```bash
docker compose logs backend
```

## Local Development

The Docker Compose files are configured so that each of the services is available in a different port in `localhost`.

For the backend and frontend, they use the same port that would be used by their local development server, so, the backend is at `http://localhost:8000` and the frontend at `http://localhost:5173`.

This way, you could turn off a Docker Compose service and start its local development service, and everything would keep working, because it all uses the same ports.

For example, you can stop that `frontend` service in the Docker Compose, in another terminal, run:

```bash
docker compose stop frontend
```

And then start the local frontend development server:

```bash
cd frontend
npm run dev
```

Or you could stop the `backend` Docker Compose service:

```bash
docker compose stop backend
```

And then you can run the local development server for the backend:

```bash
cd backend
fastapi dev app/main.py
```

## Docker Compose in `localhost.tiangolo.com`

When you start the Docker Compose stack, it uses `localhost` by default, with different ports for each service (backend, frontend, adminer, etc).

When you deploy it to production (or staging), it will deploy each service in a different subdomain, like `api.example.com` for the backend and `dashboard.example.com` for the frontend.

In the guide about [deployment](deployment.md) you can read about Traefik, the configured proxy. That's the component in charge of transmitting traffic to each service based on the subdomain.

If you want to test that it's all working locally, you can edit the local `.env` file, and change:

```dotenv
DOMAIN=localhost.tiangolo.com
```

That will be used by the Docker Compose files to configure the base domain for the services.

Traefik will use this to transmit traffic at `api.localhost.tiangolo.com` to the backend, and traffic at `dashboard.localhost.tiangolo.com` to the frontend.

The domain `localhost.tiangolo.com` is a special domain that is configured (with all its subdomains) to point to `127.0.0.1`. This way you can use that for your local development.

After you update it, run again:

```bash
docker compose watch
```

When deploying, for example in production, the main Traefik is configured outside of the Docker Compose files. For local development, there's an included Traefik in `docker-compose.override.yml`, just to let you test that the domains work as expected, for example with `api.localhost.tiangolo.com` and `dashboard.localhost.tiangolo.com`.

## Docker Compose files and env vars

There is a main `docker-compose.yml` file with all the configurations that apply to the whole stack, it is used automatically by `docker compose`.

And there's also a `docker-compose.override.yml` with overrides for development, for example to mount the source code as a volume. It is used automatically by `docker compose` to apply overrides on top of `docker-compose.yml`.

These Docker Compose files use the `.env` file containing configurations to be injected as environment variables in the containers.

They also use some additional configurations taken from environment variables set in the scripts before calling the `docker compose` command.

After changing variables, make sure you restart the stack:

```bash
docker compose watch
```

## The .env file

The `.env` file is the one that contains all your configurations, generated keys and passwords, etc.

Depending on your workflow, you could want to exclude it from Git, for example if your project is public. In that case, you would have to make sure to set up a way for your CI tools to obtain it while building or deploying your project.

One way to do it could be to add each environment variable to your CI/CD system, and updating the `docker-compose.yml` file to read that specific env var instead of reading the `.env` file.

## Pre-commits and code linting

we are using a tool called [pre-commit](https://pre-commit.com/) for code linting and formatting.

When you install it, it runs right before making a commit in git. This way it ensures that the code is consistent and formatted even before it is committed.

You can find a file `.pre-commit-config.yaml` with configurations at the root of the project.

#### Install pre-commit to run automatically

`pre-commit` is already part of the dependencies of the project, but you could also install it globally if you prefer to, following [the official pre-commit docs](https://pre-commit.com/).

After having the `pre-commit` tool installed and available, you need to "install" it in the local repository, so that it runs automatically before each commit.

Using `uv`, you could do it with:

```bash
❯ uv run pre-commit install
pre-commit installed at .git/hooks/pre-commit
```

Now whenever you try to commit, e.g. with:

```bash
git commit
```

...pre-commit will run and check and format the code you are about to commit, and will ask you to add that code (stage it) with git again before committing.

Then you can `git add` the modified/fixed files again and now you can commit.

#### Running pre-commit hooks manually

you can also run `pre-commit` manually on all the files, you can do it using `uv` with:

```bash
❯ uv run pre-commit run --all-files
check for added large files..............................................Passed
check toml...............................................................Passed
check yaml...............................................................Passed
ruff.....................................................................Passed
ruff-format..............................................................Passed
eslint...................................................................Passed
prettier.................................................................Passed
```

## URLs

The production or staging URLs would use these same paths, but with your own domain.

### Development URLs

Development URLs, for local development.

Frontend: http://localhost:5173

Backend: http://localhost:8000

Automatic Interactive Docs (Swagger UI): http://localhost:8000/docs

Automatic Alternative Docs (ReDoc): http://localhost:8000/redoc

Adminer: http://localhost:8080

Traefik UI: http://localhost:8090

MailCatcher: http://localhost:1080

### Development URLs with `localhost.tiangolo.com` Configured

Development URLs, for local development.

Frontend: http://dashboard.localhost.tiangolo.com

Backend: http://api.localhost.tiangolo.com

Automatic Interactive Docs (Swagger UI): http://api.localhost.tiangolo.com/docs

Automatic Alternative Docs (ReDoc): http://api.localhost.tiangolo.com/redoc

Adminer: http://localhost.tiangolo.com:8080

Traefik UI: http://localhost.tiangolo.com:8090

MailCatcher: http://localhost.tiangolo.com:1080