# Документация проекта «Склад»

Руководства лежат в корне репозитория (исторически рядом с compose); этот каталог — точка входа.

| Документ | Содержание |
|----------|------------|
| [../development.md](../development.md) | Локальная разработка, Docker Compose watch, агент, twin, WMS |
| [../deployment.md](../deployment.md) | Деплой, Traefik, домены, HTTPS |
| [../DOCKER.md](../DOCKER.md) | Сборка образов и типичные команды compose |
| [../backend/README.md](../backend/README.md) | Backend: uv, тесты, отладка |
| [../frontend/README.md](../frontend/README.md) | Frontend: npm, клиент OpenAPI |
| [../frontend/docs/ui-migration/](../frontend/docs/ui-migration/) | Миграция UI (shadcn), ADR |

Переменные окружения: скопируйте [../.env.example](../.env.example) → `.env`.
