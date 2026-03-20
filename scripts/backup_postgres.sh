#!/usr/bin/env bash
# Дамп БД из контейнера docker compose (сервис db).
# Запуск из корня репозитория: ./scripts/backup_postgres.sh
set -euo pipefail

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${OUT_DIR}/pgdump_${STAMP}.sql"

# Берём пользователя и БД из окружения compose (как в контейнере db).
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$OUT_FILE"
echo "OK: $OUT_FILE"
