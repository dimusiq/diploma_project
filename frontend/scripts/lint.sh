#!/usr/bin/env bash
# Блокирующий линт frontend (CI: .github/workflows/lint-frontend.yml).
# Запуск: cd frontend && bash scripts/lint.sh
# Без --write: CI не должен мутировать исходники.

set -euo pipefail
set -x

npx biome check --no-errors-on-unmatched --files-ignore-unknown=true --formatter-enabled=false ./src
npm run build
npm test
