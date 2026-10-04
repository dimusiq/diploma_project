"""Алиас live-потока под префиксом warehouse (blueprint /warehouse/live/stream).

Тот же обработчик, что ``GET /twin/stream`` — без дублирования логики.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes.twin_stream import twin_realtime_sse

router = APIRouter(prefix="/warehouse/live", tags=["warehouse-live"])

# Обратная совместимость URL: делегируем в twin_realtime_sse.
router.add_api_route(
    "/stream",
    twin_realtime_sse,
    methods=["GET"],
)
