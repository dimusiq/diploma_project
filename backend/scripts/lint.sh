#!/usr/bin/env bash
# Блокирующий линт backend (CI: .github/workflows/lint-backend.yml).
# Запуск: cd backend && uv run bash scripts/lint.sh
# python -m … — чтобы брался интерпретатор окружения uv/venv, а не «голый» PATH.
# mypy: переходные ослабления — [[tool.mypy.overrides]] в pyproject.toml (TODO до 2026-12-31).

set -euo pipefail
set -x

python -m mypy app --no-incremental
python -m ruff check app --no-cache
python -m ruff format app --check
