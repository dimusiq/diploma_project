"""Сводная аналитика цифрового двойника склада (без LLM)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

from app.api.deps import CurrentUser, SessionDep
from app.services.warehouse_twin_metrics import build_twin_summary_dict

router = APIRouter(prefix="/warehouse/twin", tags=["warehouse-twin"])


class RowLoadItem(BaseModel):
    storage_row: int
    item_count: int


class TwinSummaryResponse(BaseModel):
    """Метрики с учётом прав пользователя на товары; события — только при audit.read."""

    domain_events_by_type: dict[str, int] = Field(default_factory=dict)
    warehouse_items_by_row: list[RowLoadItem] = Field(default_factory=list)
    warehouse_items_total: int = 0
    items_expiring_within_30_days: int = 0
    layout_capacity_cells: int | None = None
    occupied_slots: int = 0
    slot_utilization_ratio: float | None = None


class WhatIfBody(BaseModel):
    """Добавить условные единицы товара по рядам (1 единица ≈ 1 ячейка в модели)."""

    additional_items_by_row: dict[int, int] = Field(default_factory=dict)

    @field_validator("additional_items_by_row")
    @classmethod
    def _validate_rows(cls, v: dict[int, int]) -> dict[int, int]:
        out: dict[int, int] = {}
        for row, n in v.items():
            if row < 1 or row > 64:
                raise ValueError("storage_row вне допустимого диапазона")
            if n < 0 or n > 10_000:
                raise ValueError("количество должно быть 0…10000")
            if n:
                out[row] = n
        return out


class WhatIfResponse(BaseModel):
    baseline_occupied_slots: int
    baseline_utilization_ratio: float | None
    projected_occupied_slots: int
    projected_utilization_ratio: float | None
    warehouse_items_by_row_after: list[RowLoadItem]


@router.get("/summary", response_model=TwinSummaryResponse)
def read_twin_summary(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    raw = build_twin_summary_dict(session, current_user)
    raw["warehouse_items_by_row"] = [
        RowLoadItem(**x) for x in raw["warehouse_items_by_row"]
    ]
    return TwinSummaryResponse(**raw)


@router.post("/what-if", response_model=WhatIfResponse)
def twin_what_if(
    session: SessionDep,
    current_user: CurrentUser,
    body: WhatIfBody,
) -> Any:
    """Простая симуляция: к занятости и счётчикам по рядам добавляются заданные объёмы."""
    raw = build_twin_summary_dict(session, current_user)
    capacity = raw["layout_capacity_cells"]
    occupied = int(raw["occupied_slots"])
    ratio_b = raw["slot_utilization_ratio"]

    row_map: dict[int, int] = {
        int(x["storage_row"]): int(x["item_count"])
        for x in raw["warehouse_items_by_row"]
    }
    extra_slots = 0
    for row, add in body.additional_items_by_row.items():
        row_map[row] = row_map.get(row, 0) + add
        extra_slots += add

    projected_occ = occupied + extra_slots
    if capacity and capacity > 0:
        projected_occ = min(projected_occ, capacity)
    ratio_p: float | None = None
    if capacity and capacity > 0:
        ratio_p = round(projected_occ / capacity, 4)

    by_row_after = [
        RowLoadItem(storage_row=r, item_count=c)
        for r, c in sorted(row_map.items())
        if c > 0
    ]

    return WhatIfResponse(
        baseline_occupied_slots=occupied,
        baseline_utilization_ratio=ratio_b,
        projected_occupied_slots=projected_occ,
        projected_utilization_ratio=ratio_p,
        warehouse_items_by_row_after=by_row_after,
    )
