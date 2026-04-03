# Frontend (Nebardak)

Стек: [Vite](https://vitejs.dev/) (Rolldown), [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [TanStack Query](https://tanstack.com/query), [TanStack Router](https://tanstack.com/router), [Tailwind CSS v4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) на [Base UI](https://base-ui.com/), тема через [next-themes](https://github.com/pacocoursey/next-themes), графики — [Recharts](https://recharts.org/). Стили и токены — `src/index.css` (семантические переменные). **Chakra UI и Emotion удалены.**

Утилиты: [Biome](https://biomejs.dev/) (`npm run lint`), [Playwright](https://playwright.dev/) для e2e.

## Разработка

Нужны Node.js (см. `.nvmrc`) и зависимости:

```bash
cd frontend
npm install
npm run dev
```

Откройте http://localhost:5173/ . API: переменная `VITE_API_URL` в `frontend/.env` (часто `http://localhost:8000`).

### Сборка и проверки

```bash
npm run lint
npm run build
```

### Клиент OpenAPI

После изменений схемы бэкенда сгенерируйте клиент (из корня репозитория см. `scripts/generate-client.sh` или `npm run generate-client` в `frontend`).

## E2E (Playwright)

Нужны **работающий API** (например `docker compose up -d` с backend) и для тестов восстановления пароля — **Mailcatcher** (`MAILCATCHER_HOST` в `.env`, по умолчанию `http://localhost:1080`).

```bash
npx playwright install chromium
npx playwright test
```

Playwright поднимает `npm run dev` сам, если порт 5173 свободен; если уже запущен свой Vite, включится `reuseExistingServer` — после правок в формах перезапустите dev-сервер, чтобы подтянуть актуальный бандл.

Сетап логина сохраняет токен в `playwright/.auth/user.json` (токен копируется из `sessionStorage` в `localStorage`, чтобы Playwright сохранил сессию).

## Структура

- `src/routes` — страницы (file-based routing через TanStack Router)
- `src/components` — UI и доменные блоки
- `src/client` — сгенерированный OpenAPI-клиент
- `tests/` — Playwright-спеки

## Удаление только фронтенда

Удалите каталог `frontend`, сервисы `frontend` / `playwright` в Compose и при необходимости переменные `FRONTEND` в `.env`.
