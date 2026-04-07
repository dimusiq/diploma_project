# Сборка и запуск проекта в Docker

## Быстрый старт (локальная разработка)

```bash
# 1. Убедитесь, что в корне есть .env (пример — см. раздел «Переменные окружения»)

# 2. Собрать образы и запустить все сервисы
docker compose up --build -d

# или с пересборкой при изменениях (режим разработки)
docker compose watch
```

После запуска:
- **Frontend:** http://localhost:5173  
- **Backend API:** http://localhost:8000  
- **Документация API:** http://localhost:8000/docs  
- **Adminer (БД):** http://localhost:8080  
- **Traefik UI:** http://localhost:8090  

---

## Только сборка образов

### Всё приложение (backend + frontend)

```bash
docker compose build
```

### Отдельные сервисы

```bash
# только backend
docker compose build backend

# только frontend (укажите VITE_API_URL для API в production)
docker compose build frontend --build-arg VITE_API_URL=https://api.example.com
```

### Production-сборка (без override)

Для production используются образы с тегами и без `docker-compose.override.yml`:

```bash
export TAG=1.0.0
export DOCKER_IMAGE_BACKEND=backend
export DOCKER_IMAGE_FRONTEND=frontend

docker compose -f docker-compose.yml build
```

Перед этим нужна сеть Traefik и переменные из `.env` (см. `deployment.md`).

---

## Переменные окружения

Минимальный набор в `.env` в корне проекта:

```env
DOMAIN=localhost
STACK_NAME=sklad
FRONTEND_HOST=http://localhost:5173
ENVIRONMENT=local

# Секреты (для production замените на сгенерированные)
SECRET_KEY=changethis
FIRST_SUPERUSER=admin@example.com
FIRST_SUPERUSER_PASSWORD=changethis

# PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changethis
POSTGRES_DB=app
POSTGRES_SERVER=db
POSTGRES_PORT=5432

# Образы
DOCKER_IMAGE_BACKEND=backend
DOCKER_IMAGE_FRONTEND=frontend

# CORS (для доступа с фронтенда)
BACKEND_CORS_ORIGINS="http://localhost,http://localhost:5173"
```

Для генерации надёжного `SECRET_KEY`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## Frontend: передача VITE_API_URL

На этапе сборки фронтенду нужен URL бэкенда (подставляется в `import.meta.env.VITE_API_URL`).

В `docker-compose` это уже задаётся через `build.args`:

- **Локальная разработка** (`docker-compose.override.yml`):  
  `VITE_API_URL=http://localhost:8000`
- **Production** (`docker-compose.yml`):  
  `VITE_API_URL=https://api.${DOMAIN}`

При ручной сборке:

```bash
docker build -f frontend/Dockerfile \
  --build-arg VITE_API_URL=http://localhost:8000 \
  -t frontend:latest \
  ./frontend
```

---

## Полезные команды

```bash
# Остановить всё
docker compose down

# Логи
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend

# Пересобрать без кэша
docker compose build --no-cache
```

---

## Production и Traefik

Для деплоя с Traefik, доменами и HTTPS см. **`deployment.md`**.
