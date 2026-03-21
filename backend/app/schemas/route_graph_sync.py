"""Тела запросов/ответов для синхронизации графа маршрутов."""

from __future__ import annotations

import uuid

from pydantic import BaseModel


class RouteGraphSyncBody(BaseModel):
    """Если warehouse_layout_id не задан — используется активный layout."""

    warehouse_layout_id: uuid.UUID | None = None


class RouteGraphSyncResult(BaseModel):
    warehouse_layout_id: uuid.UUID
    nodes_deleted: int
    edges_deleted: int
    nodes_created: int
    edges_created: int
