"""Переключение os.environ на тестовую БД до импорта Settings (только stdlib)."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import unquote, urlparse


def load_dotenv_defaults(env_file: Path) -> None:
    """Подставить в os.environ ключи из .env, не перезаписывая уже заданные."""
    if not env_file.is_file():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def apply_test_database_env() -> str:
    """
    До импорта Settings: направить POSTGRES_* на тестовую БД.

    Приоритет: TEST_DATABASE_URL → TEST_POSTGRES_DB → ``{POSTGRES_DB}_test``.
    Возвращает имя целевой БД.
    """
    # backend/app/tests/db_env.py → parents[3] = корень репозитория
    repo_root = Path(__file__).resolve().parents[3]
    load_dotenv_defaults(repo_root / ".env")
    # Маркер для alembic env.py (не трогать logging) и защиты.
    os.environ.setdefault("NEBARDAK_TESTING", "1")

    raw_url = (os.environ.get("TEST_DATABASE_URL") or "").strip()
    if raw_url:
        parsed = urlparse(raw_url)
        if not parsed.path or parsed.path == "/":
            raise RuntimeError("TEST_DATABASE_URL должен содержать имя базы в path")
        db_name = unquote(parsed.path.lstrip("/").split("/")[0])
        if parsed.hostname:
            os.environ["POSTGRES_SERVER"] = parsed.hostname
        if parsed.port:
            os.environ["POSTGRES_PORT"] = str(parsed.port)
        if parsed.username:
            os.environ["POSTGRES_USER"] = unquote(parsed.username)
        if parsed.password is not None:
            os.environ["POSTGRES_PASSWORD"] = unquote(parsed.password)
        os.environ["POSTGRES_DB"] = db_name
        return db_name

    explicit = (os.environ.get("TEST_POSTGRES_DB") or "").strip()
    base_db = (os.environ.get("POSTGRES_DB") or "app").strip()
    if explicit:
        test_db = explicit
    elif base_db.endswith("_test"):
        # Уже тестовая (повторный импорт / ручной POSTGRES_DB=*_test).
        test_db = base_db
    else:
        test_db = f"{base_db}_test"
    os.environ["POSTGRES_DB"] = test_db
    return test_db


# Срабатывает при первом импорте модуля (conftest должен импортировать это до Settings).
TEST_DB_NAME: str = apply_test_database_env()
