"""Чистые функции пути, оценки и трёх политик. Вызовов LLM нет."""

from __future__ import annotations

import random
from dataclasses import dataclass

from app.optimization.schemas import (
    Assignment,
    GridSlot,
    MovableItem,
    PolicyPath,
    RankedMove,
    SlottingRecommendation,
)

TRAVEL_SCALE_MIN = 0.25
TRAVEL_SCALE_MAX = 4.0
_POLICY_RULES = {
    "random": "random",
    "nearest": "nearest",
    "ai": "nearest",
}


def clamp_travel_scale(value: float) -> float:
    return max(TRAVEL_SCALE_MIN, min(TRAVEL_SCALE_MAX, float(value)))


def slot_travel(slot: GridSlot, route_unit: float | None = None) -> float:
    """Манхэттен до якоря отбора (ряд 1, X 1); уровень 1 — pick-face.

    Если у склада есть рёбра маршрута, ``route_unit`` — средний ``RouteEdge.weight``.
    Рёбра описывают проходы, а не ячейки, поэтому вес масштабирует сетку целиком.
    """
    grid = abs(slot.row - 1) + abs(slot.cell_x - 1)
    if slot.level != 1:
        grid += slot.level - 1
    if route_unit is not None and route_unit > 0:
        return float(grid) * float(route_unit)
    return float(grid)


def score_assignment(item_velocity: float, travel: float, row_load: float) -> float:
    """Чем выше, тем лучше: быстрый товар ближе, загрузка ряда и путь снижают оценку."""
    return float(item_velocity) / (1.0 + float(travel)) - float(row_load)


def cap_slots(slots: list[GridSlot], max_candidates: int) -> list[GridSlot]:
    ordered = sorted(slots, key=lambda slot: slot.slot_key)
    limit = max(0, int(max_candidates))
    return ordered[:limit]


@dataclass(frozen=True)
class TravelScales:
    raw: dict[str, float]
    clamped: dict[str, float]


def travel_scales(mean_random: float, mean_nearest: float, mean_ai: float) -> TravelScales:
    denom = mean_nearest if mean_nearest > 0 else 1.0
    raw = {
        "random": mean_random / denom,
        "nearest": (mean_nearest / denom) if mean_nearest > 0 else 0.0,
        "ai": mean_ai / denom,
    }
    clamped = {
        "random": clamp_travel_scale(raw["random"]),
        "nearest": 1.0,
        "ai": clamp_travel_scale(raw["ai"]),
    }
    return TravelScales(raw=raw, clamped=clamped)


def improvement_ratio(mean_nearest: float, mean_ai: float) -> float:
    denom = mean_nearest if mean_nearest > 0 else 1.0
    return (mean_nearest - mean_ai) / denom


def classify_abc(movement_counts: dict[str, int]) -> dict[str, str]:
    """Классы A/B/C по накопленной частоте 80/95, как в ABC-маршруте."""
    classes = dict.fromkeys(movement_counts, "C")
    positive = sorted(
        ((item_id, count) for item_id, count in movement_counts.items() if count > 0),
        key=lambda pair: (-pair[1], pair[0]),
    )
    total = sum(count for _, count in positive)
    if total <= 0:
        return classes
    cumulative = 0
    for item_id, count in positive:
        cumulative += count
        pct = cumulative / total
        if pct <= 0.80:
            classes[item_id] = "A"
        elif pct <= 0.95:
            classes[item_id] = "B"
        else:
            classes[item_id] = "C"
    return classes


def velocity_weight(abc_class: str, movement_count: int) -> float:
    base = {"A": 3.0, "B": 2.0, "C": 1.0}.get(abc_class, 1.0)
    return base * (1.0 + float(movement_count))


def _weighted_mean(rows: list[Assignment]) -> float:
    if not rows:
        return 0.0
    weight = sum(max(row.velocity, 0.0) for row in rows)
    if weight <= 0:
        return sum(row.travel for row in rows) / len(rows)
    return sum(row.velocity * row.travel for row in rows) / weight


def _assign_nearest(
    items: list[MovableItem],
    slots: list[GridSlot],
    route_unit: float | None,
) -> list[Assignment]:
    pool = list(slots)
    rows: list[Assignment] = []
    for item in sorted(items, key=lambda row: row.item_id):
        if not pool:
            break
        best = min(pool, key=lambda slot: (slot_travel(slot, route_unit), slot.slot_key))
        pool.remove(best)
        travel = slot_travel(best, route_unit)
        rows.append(
            Assignment(
                item_id=item.item_id,
                current_slot_key=item.current_slot_key,
                velocity=item.velocity,
                slot_key=best.slot_key,
                row=best.row,
                travel=travel,
                score=score_assignment(item.velocity, travel, 0.0),
            )
        )
    return rows


def _assign_random(
    items: list[MovableItem],
    slots: list[GridSlot],
    seed: int,
    route_unit: float | None,
) -> list[Assignment]:
    pool = list(slots)
    random.Random(seed).shuffle(pool)
    rows: list[Assignment] = []
    ordered = sorted(items, key=lambda row: row.item_id)
    for item, slot in zip(ordered, pool, strict=False):
        travel = slot_travel(slot, route_unit)
        rows.append(
            Assignment(
                item_id=item.item_id,
                current_slot_key=item.current_slot_key,
                velocity=item.velocity,
                slot_key=slot.slot_key,
                row=slot.row,
                travel=travel,
                score=score_assignment(item.velocity, travel, 0.0),
            )
        )
    return rows


def _assign_ai(
    items: list[MovableItem],
    slots: list[GridSlot],
    row_loads: dict[int, float],
    row_load_step: float,
    route_unit: float | None,
) -> list[Assignment]:
    pool = list(slots)
    loads = dict(row_loads)
    rows: list[Assignment] = []
    ordered = sorted(items, key=lambda row: (-row.velocity, row.item_id))
    for item in ordered:
        if not pool:
            break

        def sort_key(slot: GridSlot, current: MovableItem = item) -> tuple[float, str]:
            travel = slot_travel(slot, route_unit)
            load = loads.get(slot.row, 0.0)
            return (-score_assignment(current.velocity, travel, load), slot.slot_key)

        best = min(pool, key=sort_key)
        pool.remove(best)
        travel = slot_travel(best, route_unit)
        load = loads.get(best.row, 0.0)
        rows.append(
            Assignment(
                item_id=item.item_id,
                current_slot_key=item.current_slot_key,
                velocity=item.velocity,
                slot_key=best.slot_key,
                row=best.row,
                travel=travel,
                score=score_assignment(item.velocity, travel, load),
            )
        )
        loads[best.row] = load + max(0.0, row_load_step)
    return rows


def _moves_from_assignments(
    rows: list[Assignment],
    *,
    below: bool,
    improvement: float,
    top_k: int,
) -> tuple[list[RankedMove], list[RankedMove]]:
    ranked: list[RankedMove] = []
    for row in rows[: max(0, top_k)]:
        note = (
            f"AI slotting: {row.item_id} → {row.slot_key} "
            f"(score {row.score:.4f}, improvement {improvement:.4f})"
        )
        ranked.append(
            RankedMove(
                item_id=row.item_id,
                slot_key=row.slot_key,
                current_slot_key=row.current_slot_key,
                score=row.score,
                travel=row.travel,
                below_min_improvement=below,
                note=note,
            )
        )
    if below:
        return ranked, []
    transfers = [
        move
        for move in ranked
        if move.slot_key != (move.current_slot_key or "")
    ]
    return ranked, transfers


def optimize_slotting(
    items: list[MovableItem],
    slots: list[GridSlot],
    *,
    seed: int,
    max_candidates: int,
    top_k: int,
    min_improvement: float,
    row_loads: dict[int, float] | None = None,
    row_load_step: float = 0.0,
    route_unit: float | None = None,
) -> SlottingRecommendation:
    """Один и тот же набор товаров для random, nearest и AI. Отличается только раскладка."""
    capped = cap_slots(slots, max_candidates)
    chosen = sorted(items, key=lambda row: (-row.velocity, row.item_id))
    chosen = chosen[: min(len(chosen), len(capped))]
    loads = dict(row_loads or {})
    by_policy = {
        "random": _assign_random(chosen, capped, seed, route_unit),
        "nearest": _assign_nearest(chosen, capped, route_unit),
        "ai": _assign_ai(chosen, capped, loads, row_load_step, route_unit),
    }
    means = {name: _weighted_mean(rows) for name, rows in by_policy.items()}
    scales = travel_scales(means["random"], means["nearest"], means["ai"])
    improvement = improvement_ratio(means["nearest"], means["ai"])
    below = improvement < float(min_improvement)
    top, transfers = _moves_from_assignments(
        by_policy["ai"],
        below=below,
        improvement=improvement,
        top_k=top_k,
    )
    paths = {
        name: PolicyPath(
            putaway_rule=_POLICY_RULES[name],
            mean_path=means[name],
            raw_path_ratio=scales.raw[name],
            layout_travel_scale=scales.clamped[name],
        )
        for name in ("random", "nearest", "ai")
    }
    return SlottingRecommendation(
        top=top,
        transfers=transfers,
        below_min_improvement=below,
        improvement=improvement,
        paths=paths,
    )
