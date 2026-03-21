"""Топология склада (в spec v1 — поле topology внутри WarehouseLayoutSpecV1 или плоский ключ topology)."""

from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class NormPoint(BaseModel):
    """Точка в нормализованных координатах плана (0..1 по X и Z)."""

    x: float = Field(ge=0, le=1)
    z: float = Field(ge=0, le=1)


StorageZoneType = Literal["storage", "staging", "buffer", "dock_area", "cross_dock", "receiving", "shipping", "other"]
AisleKind = Literal["main", "cross", "feeder"]
DockType = Literal["inbound", "outbound", "cross"]


class TopologyStorageZone(BaseModel):
    """Зона хранения / логистическая зона в привязке к сетке layout (1-based как в UI товаров)."""

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=256)
    zone_type: StorageZoneType = "storage"
    row_from_1based: int = Field(ge=1)
    row_to_1based: int = Field(ge=1)
    level_from_1based: int = Field(default=1, ge=1)
    level_to_1based: int = Field(ge=1)
    cell_x_from_1based: int = Field(default=1, ge=1)
    cell_x_to_1based: int = Field(ge=1)
    cell_z_from_1based: int = Field(default=1, ge=1)
    cell_z_to_1based: int = Field(ge=1)
    color: str = Field(default="#3b82f6", max_length=32)

    @model_validator(mode="after")
    def ranges_order(self) -> TopologyStorageZone:
        if self.row_to_1based < self.row_from_1based:
            raise ValueError("row_to_1based must be >= row_from_1based")
        if self.level_to_1based < self.level_from_1based:
            raise ValueError("level_to_1based must be >= level_from_1based")
        if self.cell_x_to_1based < self.cell_x_from_1based:
            raise ValueError("cell_x_to_1based must be >= cell_x_from_1based")
        if self.cell_z_to_1based < self.cell_z_from_1based:
            raise ValueError("cell_z_to_1based must be >= cell_z_from_1based")
        return self


class TopologyAisle(BaseModel):
    """Проход (полилиния в нормализованных координатах плана склада)."""

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=256)
    kind: AisleKind = "main"
    polyline_norm: list[NormPoint] = Field(default_factory=list)
    width_m: float = Field(default=2.5, gt=0, le=20)


class TopologyBufferZone(BaseModel):
    """Буферная зона (логическая; опционально привязка к рядам)."""

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=256)
    row_from_1based: int | None = Field(default=None, ge=1)
    row_to_1based: int | None = Field(default=None, ge=1)
    notes: str = Field(default="", max_length=2000)


class TopologyDock(BaseModel):
    """Док / ворота (позиция на плане в нормализованных координатах)."""

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=256)
    code: str = Field(min_length=1, max_length=64)
    dock_type: DockType = "inbound"
    x_norm: float = Field(ge=0, le=1)
    z_norm: float = Field(ge=0, le=1)
    yaw_deg: float = Field(default=0, ge=-180, le=180)
    bay_count: int = Field(default=1, ge=1, le=99)


class TopologyDocument(BaseModel):
    """Версия схемы для миграций клиента."""

    schema_version: Literal[1] = 1
    zones: list[TopologyStorageZone] = Field(default_factory=list)
    aisles: list[TopologyAisle] = Field(default_factory=list)
    buffer_zones: list[TopologyBufferZone] = Field(default_factory=list)
    docks: list[TopologyDock] = Field(default_factory=list)


def default_topology_from_layout_spec(spec: dict[str, Any]) -> TopologyDocument:
    """Шаблон топологии по геометрии spec (плоский или v1 с полем geometry)."""
    from app.schemas.warehouse_layout_spec import try_parse_warehouse_layout_spec

    parsed = try_parse_warehouse_layout_spec(spec)
    if parsed is not None:
        g = parsed.geometry
        rows, levels, cx, cz = g.rows, g.levels, g.cellX, g.cellZ
    else:
        rows = int(spec.get("rows") or 12)
        levels = int(spec.get("levels") or 4)
        cx = int(spec.get("cellX") or 20)
        cz = int(spec.get("cellZ") or 1)
    return TopologyDocument(
        zones=[
            TopologyStorageZone(
                id=str(uuid.uuid4()),
                name="Основное хранение",
                zone_type="storage",
                row_from_1based=1,
                row_to_1based=max(1, rows),
                level_from_1based=1,
                level_to_1based=max(1, levels),
                cell_x_from_1based=1,
                cell_x_to_1based=max(1, cx),
                cell_z_from_1based=1,
                cell_z_to_1based=max(1, cz),
                color="#3b82f6",
            )
        ],
        aisles=[
            TopologyAisle(
                id=str(uuid.uuid4()),
                name="Проходы между блоками стеллажей",
                kind="main",
                polyline_norm=[],
                width_m=2.5,
            )
        ],
        buffer_zones=[],
        docks=[
            TopologyDock(
                id=str(uuid.uuid4()),
                name="Приёмка",
                code="IN-1",
                dock_type="inbound",
                x_norm=0.08,
                z_norm=0.5,
                yaw_deg=90,
                bay_count=1,
            ),
            TopologyDock(
                id=str(uuid.uuid4()),
                name="Отгрузка",
                code="OUT-1",
                dock_type="outbound",
                x_norm=0.92,
                z_norm=0.5,
                yaw_deg=-90,
                bay_count=1,
            ),
        ],
    )


def parse_topology_from_spec(spec: dict[str, Any]) -> TopologyDocument | None:
    if not isinstance(spec, dict):
        return None
    raw = spec.get("topology")
    if isinstance(raw, dict):
        try:
            return TopologyDocument.model_validate(raw)
        except Exception:
            pass
    from app.schemas.warehouse_layout_spec import try_parse_warehouse_layout_spec

    doc = try_parse_warehouse_layout_spec(spec)
    return doc.topology if doc else None
