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

Фоновый **worker** (планировщик email-отчётов вынесен из API при `RUN_REPORT_SCHEDULER_IN_API=false`):

```bash
docker compose logs -f worker
```

Локально без Docker: `cd backend && uv run python -m app.worker` (нужны Postgres, опционально `REDIS_URL` для распределённой блокировки).

Read-модель занятости ячеек (проекция для twin/KPI): `GET /api/v1/warehouse/occupancy` (легковесный список `slot_key` → `item_id`). Полный пересчёт в фоне — воркер раз в час; при CRUD товаров проекция обновляется в той же транзакции.

**Real-time товары (склад, 3D, списки):** после `POST/PUT/DELETE` товара сервер рассылает событие **`items_updated`**. Клиент: **SSE** `GET /api/v1/items/stream` (заголовок `Authorization: Bearer …`, как у `/notifications/stream`) — во фронте подключён в layout (`useItemsRealtime`), инвалидирует React Query `["items"]`. **WebSocket** `WS /api/v1/items/ws?token=<JWT>` — те же JSON-сообщения (удобно для нативных клиентов; в браузере обычно достаточно SSE). Хаб в памяти процесса: при **нескольких репликах API** подписчики на разных воркерах не видят чужие события — для продакшена с горизонтальным масштабированием понадобится Redis Pub/Sub или аналог.

Чат-ассистент по складу: **`POST /api/v1/agent/chat`** (`{"message":"..."}`), **`GET /api/v1/agent/permissions`** (`can_use` для UI). Нужно право **`agent.use`** (по умолчанию у ролей admin, manager, warehouse, viewer). Лимит запросов: **`AGENT_CHAT_RATE_LIMIT_PER_MINUTE`** (по умолчанию 30/мин на пользователя; в памяти API-процесса, при **`REDIS_URL`** — через Redis). Контекст: агрегаты склада по правам, **RAG** из таблицы `agent_knowledge_chunk` (keyword; векторный поиск через **pgvector** при наличии колонки `embedding_vec` и эмбеддинга запроса; иначе JSONB/keyword), **инструмент** `search_items_in_warehouse` (read-only, с теми же границами, что у пользователя). Размерность эмбеддингов: **768** (`app/core/agent_vector.py`, модель по умолчанию **`OLLAMA_EMBED_MODEL`**). LLM: **`OLLAMA_BASE_URL`**, **`OLLAMA_MODEL`**; из Docker Desktop на Windows к хосту: `http://host.docker.internal:11434`. Без Ollama — текстовая сводка контекста (+ RAG, если таблица заполнена). Миграции: `alembic upgrade head`. Страница **`/assistant`** в меню видна только при `can_use`.

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