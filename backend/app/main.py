import asyncio
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

import sentry_sdk
from fastapi import FastAPI
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.config import settings
from app.core.report_scheduler import report_scheduler_loop
from app.warehouse_sim.runtime import ensure_seed_layout, start_runtime, stop_runtime


def custom_generate_unique_id(route: APIRoute) -> str:
    tag = route.tags[0] if route.tags else "default"
    return f"{tag}-{route.name}"


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    stop_event: asyncio.Event | None = None
    task: asyncio.Task | None = None  # type: ignore[type-arg]
    if settings.emails_enabled and settings.RUN_REPORT_SCHEDULER_IN_API:
        stop_event = asyncio.Event()
        redis_url = str(settings.REDIS_URL) if settings.REDIS_URL else None
        task = asyncio.create_task(
            report_scheduler_loop(stop_event, redis_url=redis_url)
        )
    try:
        ensure_seed_layout()
    except Exception:
        # Миграции могут ещё не быть применены (тесты без alembic на пустой БД).
        pass
    await start_runtime()
    yield
    await stop_runtime()
    if stop_event is not None:
        stop_event.set()
    if task is not None:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
    lifespan=_lifespan,
)

# CORS: всегда включаем (иначе при пустом списке из env браузер показывает «generic» CORS error).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.all_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)
