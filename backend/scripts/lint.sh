#!/usr/bin/env bash
# Блокирующий линт backend (CI: .github/workflows/lint-backend.yml).
# Запуск: cd backend && uv run bash scripts/lint.sh
# Порядок и флаги совпадают с CI: mypy (strict) → ruff check → ruff format --check.
# python -m … — интерпретатор окружения uv/venv, а не «голый» PATH.

set -euo pipefail
set -x

python -m mypy app --no-incremental
python -m ruff check app --no-cache
python -m ruff format app --check
