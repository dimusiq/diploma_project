"""Алиас live-потока под префиксом warehouse (blueprint /warehouse/live/stream)."""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.api.deps import CurrentUser
from app.realtime.twin_stream_hub import (
    _DEFAULT_REPLAY_SECONDS,
    _MAX_REPLAY_SECONDS_CAP,
    parse_channels_param,
    twin_sse_stream,
)

router = APIRouter(prefix="/warehouse/live", tags=["warehouse-live"])


@router.get("/stream")
async def warehouse_live_sse(
    _current_user: CurrentUser,
    channels: str | None = Query(
        default=None,
        description="Каналы через запятую или * / пусто = все",
    ),
    replay_seconds: int = Query(
        default=_DEFAULT_REPLAY_SECONDS,
        ge=0,
        le=_MAX_REPLAY_SECONDS_CAP,
        description="Replay событий за последние N секунд при подключении",
    ),
) -> StreamingResponse:
    ch = parse_channels_param(channels)
    return StreamingResponse(
        twin_sse_stream(channels=ch, replay_seconds=replay_seconds),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
