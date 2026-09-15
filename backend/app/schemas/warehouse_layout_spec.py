"""Версионируемая схема warehouse_layout.spec (v1): геометрия + топология + расширения."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.warehouse_topology import TopologyDocument


class LayoutGeometryV1(BaseModel):
    """Числовая сетка склада (ключи cellX/cellZ как в API и 3D-клиенте)."""

    rows: int = Field(default=8, ge=1, le=512)
    levels: int = Field(default=3, ge=1, le=128)
    cellX: int = Field(default=12, ge=1, le=1024)
    cellZ: int = Field(default=1, ge=1, le=512)
    coordinateSystem: str = Field(default="1-based", max_length=64)
    cellKeyFormat: str = Field(default="zeroBasedDashSeparated", max_length=64)


class WarehouseLayoutSpecV1(BaseModel):
    """
    Корневая схема spec в БД (канонический вид): schema_version + geometry + опционально topology.

    Легаси-плоский вид {rows, levels, cellX, cellZ, topology?, ...} поднимается валидатором.
    """

    schema_version: Literal[1] = 1
    geometry: LayoutGeometryV1 = Field(default_factory=LayoutGeometryV1)
    topology: TopologyDocument | None = None
    extensions: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _lift_legacy_flat_spec(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if data.get("schema_version") == 1 and isinstance(data.get("geometry"), dict):
            return data

        reserved = frozenset({"topology", "schema_version", "geometry", "extensions"})
        geo_keys = (
            "rows",
            "levels",
            "cellX",
            "cellZ",
            "coordinateSystem",
            "cellKeyFormat",
        )
        geometry = {k: data[k] for k in geo_keys if k in data}
        extensions: dict[str, Any] = {}
        if isinstance(data.get("extensions"), dict):
            extensions.update(data["extensions"])
        for k, v in data.items():
            if k in reserved or k in geo_keys:
                continue
            extensions[k] = v
        out: dict[str, Any] = {
            "schema_version": 1,
            "geometry": geometry,
            "extensions": extensions,
        }
        topo = data.get("topology")
        if isinstance(topo, dict):
            out["topology"] = topo
        return out


def parse_warehouse_layout_spec(raw: dict[str, Any] | None) -> WarehouseLayoutSpecV1:
    if not raw or not isinstance(raw, dict):
        return WarehouseLayoutSpecV1()
    return WarehouseLayoutSpecV1.model_validate(raw)


def try_parse_warehouse_layout_spec(raw: dict[str, Any] | None) -> WarehouseLayoutSpecV1 | None:
    try:
        return parse_warehouse_layout_spec(raw)
    except Exception:
        return None


def canonical_spec_dict(spec: WarehouseLayoutSpecV1) -> dict[str, Any]:
    """Сериализация для сохранения в JSONB (вложенная геометрия)."""
    return spec.model_dump(mode="json", exclude_none=True)


def layout_spec_for_api_response(spec: WarehouseLayoutSpecV1) -> dict[str, Any]:
    """
    Плоский вид для клиентов: rows/cellX на верхнем уровне + schema_version + topology.

    Не дублирует ключи геометрии в extensions.
    """
    g = spec.geometry.model_dump(mode="json")
    reserved = frozenset(
        {
            "rows",
            "levels",
            "cellX",
            "cellZ",
            "coordinateSystem",
            "cellKeyFormat",
            "topology",
            "schema_version",
            "geometry",
            "extensions",
        }
    )
    ext_safe = {k: v for k, v in spec.extensions.items() if k not in reserved}
    out: dict[str, Any] = {**g, **ext_safe, "schema_version": spec.schema_version}
    if spec.topology is not None:
        out["topology"] = spec.topology.model_dump(mode="json")
    return out


def layout_capacity_cells(spec: WarehouseLayoutSpecV1) -> int:
    g = spec.geometry
    return int(g.rows * g.levels * g.cellX * g.cellZ)
