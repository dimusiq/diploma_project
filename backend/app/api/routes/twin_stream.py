"""Единый SSE/WebSocket поток twin с каналами и replay."""

from __future__ import annotations

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.api.deps import CurrentUser, get_user_from_token_string
from app.core.db import engine
from app.realtime.twin_stream_hub import (
    _DEFAULT_REPLAY_SECONDS,
    _MAX_REPLAY_SECONDS_CAP,
    ALL_CHANNELS,
    history_messages_for_replay,
    parse_channels_param,
    subscribe_twin,
    twin_sse_stream,
    unsubscribe_twin,
)

router = APIRouter(prefix="/twin", tags=["twin-realtime"])


@router.get("/stream")
async def twin_realtime_sse(
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


@router.websocket("/ws")
async def twin_realtime_ws(websocket: WebSocket) -> None:
    """Те же события, что SSE. Query: token|access_token, channels, replay_seconds (0–600)."""
    tok = websocket.query_params.get("token") or websocket.query_params.get(
        "access_token"
    )
    if not tok:
        await websocket.close(code=1008)
        return
    ch_raw = websocket.query_params.get("channels")
    q_rs = websocket.query_params.get("replay_seconds")
    try:
        rs_raw = int(q_rs) if q_rs is not None else _DEFAULT_REPLAY_SECONDS
    except ValueError:
        rs_raw = _DEFAULT_REPLAY_SECONDS
    rs = max(0, min(int(rs_raw), _MAX_REPLAY_SECONDS_CAP))

    with Session(engine) as session:
        if get_user_from_token_string(session, tok) is None:
            await websocket.close(code=1008)
            return

    ch_set = parse_channels_param(ch_raw)
    await websocket.accept()

    replay = history_messages_for_replay(channels=ch_set, replay_seconds=rs)
    try:
        await websocket.send_json({"type": "twin_replay_start", "count": len(replay)})
        for msg in replay:
            await websocket.send_json(msg)
        await websocket.send_json(
            {"type": "twin_replay_done", "channels": sorted(ch_set)}
        )
    except WebSocketDisconnect:
        return

    q = subscribe_twin(channels=ch_set)
    try:
        while True:
            msg = await q.get()
            await websocket.send_json(msg)
    except WebSocketDisconnect:
        pass
    finally:
        unsubscribe_twin(q)


@router.get("/channels", response_model=list[str])
def list_twin_channels(_current_user: CurrentUser) -> list[str]:
    """Справочник имён каналов для подписки."""
    return sorted(ALL_CHANNELS)
