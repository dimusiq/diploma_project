import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.config import settings
from app.core.report_scheduler import report_scheduler_loop
from app.warehouse_sim.runtime import ensure_seed_layout, start_runtime, stop_runtime

logger = logging.getLogger(__name__)


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


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return JSON 500 inside ExceptionMiddleware so CORS headers are still applied.

    Starlette's ServerErrorMiddleware sits outside CORSMiddleware; an unhandled
    crash otherwise looks like a CORS failure in the browser.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    if settings.SENTRY_DSN:
        sentry_sdk.capture_exception(exc)
    detail = "Internal Server Error"
    if settings.ENVIRONMENT == "local":
        detail = f"{type(exc).__name__}: {exc}"
    origin = request.headers.get("origin")
    headers: dict[str, str] = {}
    if origin and origin.rstrip("/") in {
        o.rstrip("/") for o in settings.all_cors_origins
    }:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(status_code=500, content={"detail": detail}, headers=headers)
