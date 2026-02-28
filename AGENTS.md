## Cursor Cloud specific instructions

### Services overview

| Service | Tech | Port | Notes |
|---------|------|------|-------|
| Backend | FastAPI (Python 3.12) | 8000 | API + auth + business logic |
| Frontend | React 19 + Vite | 5173 | SPA dashboard |
| Database | PostgreSQL 12 (Docker) | 5432 | Required, run via `sudo docker start nebardak-db` |

### Starting services

1. **PostgreSQL**: `sudo docker start nebardak-db` (container already created; if missing, `sudo docker run -d --name nebardak-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=changethis -e POSTGRES_DB=app -p 5432:5432 postgres:12`)
2. **Migrations + seed**: From `backend/`, activate venv and run `alembic upgrade head && python app/initial_data.py` with env vars from `.env` (ensure `POSTGRES_SERVER=localhost`)
3. **Backend**: `cd backend && source .venv/bin/activate && fastapi dev app/main.py --host 0.0.0.0 --port 8000` (requires env vars: see `.env`)
4. **Frontend**: `cd frontend && npm run dev -- --host 0.0.0.0` (set `VITE_API_URL=http://localhost:8000`)

### Environment variables

All backend env vars are in the root `.env` file. For local dev, ensure `POSTGRES_SERVER=localhost`. The backend reads config via `pydantic-settings` (`app/core/config.py`).

### Credentials

Default superuser: `admin@example.com` / `changethis`

### Docker daemon

The Docker daemon must be running for PostgreSQL: `sudo dockerd &>/tmp/dockerd.log &`. The environment uses `fuse-overlayfs` storage driver and `iptables-legacy`.

### Lint and test commands

- **Backend lint**: `cd backend && ruff check app && ruff format app --check` (pre-existing format issues exist)
- **Backend tests**: `cd backend && pytest app/tests -v` (pre-existing failures due to missing `status` column migration on `item` table)
- **Frontend lint**: `cd frontend && npx biome check --no-errors-on-unmatched --files-ignore-unknown=true --formatter-enabled=false ./src` (pre-existing lint issues)
- **Frontend build**: `cd frontend && npm run build`

### Known issues

- The `item` table is missing a `status` column (the `Item` model defines it, but no Alembic migration adds it). This causes most backend tests involving item creation to fail.
- `ruff format --check` reports pre-existing formatting issues in 14 files.
- Frontend biome reports pre-existing lint/import-order issues.

### System dependencies

`libcairo2-dev` is required for building `pycairo` (dependency of `svglib`). Node.js 20 is required (`.nvmrc`).
