"""Чистый счёт слоттинга: порядок, лимит кандидатов, порог улучшения."""

from app.optimization.constraints import slot_key_within_geometry
from app.optimization.schemas import GridSlot, MovableItem
from app.optimization.scoring import (
    optimize_slotting,
    score_assignment,
    travel_scales,
)
from app.schemas.warehouse_layout_spec import LayoutGeometryV1


def _item(
    item_id: str,
    velocity: float,
    *,
    current: str = "4-0-4-0",
) -> MovableItem:
    return MovableItem(
        item_id=item_id,
        current_slot_key=current,
        velocity=velocity,
        row=5,
        level=1,
        cell_x=5,
        cell_z=1,
    )


def _slot(key: str, row: int, level: int, cell_x: int) -> GridSlot:
    return GridSlot(slot_key=key, row=row, level=level, cell_x=cell_x, cell_z=1)


def test_score_prefers_velocity_short_travel_and_low_load() -> None:
    assert score_assignment(3, 1, 0) > score_assignment(1, 1, 0)
    assert score_assignment(3, 1, 0) > score_assignment(3, 5, 0)
    assert score_assignment(3, 1, 0) > score_assignment(3, 1, 0.5)


def test_optimize_is_deterministic() -> None:
    items = [_item("b-fast", 10), _item("a-slow", 0.1)]
    slots = [
        _slot("0-0-0-0", 1, 1, 1),
        _slot("5-1-7-0", 6, 2, 8),
    ]
    first = optimize_slotting(
        items,
        slots,
        seed=7,
        max_candidates=200,
        top_k=5,
        min_improvement=0.05,
    )
    second = optimize_slotting(
        items,
        slots,
        seed=7,
        max_candidates=200,
        top_k=5,
        min_improvement=0.05,
    )
    assert first.transfers == second.transfers
    assert first.paths["ai"].mean_path == second.paths["ai"].mean_path
    assert [row.item_id for row in first.top] == ["b-fast", "a-slow"]


def test_candidate_cap_drops_later_slot_keys() -> None:
    slots = [
        _slot("0-0-0-0", 1, 1, 1),
        _slot("1-0-0-0", 2, 1, 1),
        _slot("2-0-0-0", 3, 1, 1),
        _slot("9-0-9-0", 10, 1, 10),
    ]
    result = optimize_slotting(
        [_item("only", 4)],
        slots,
        seed=1,
        max_candidates=2,
        top_k=5,
        min_improvement=0.0,
    )
    used = {row.slot_key for row in result.top}
    assert used
    assert used <= {"0-0-0-0", "1-0-0-0"}
    assert "9-0-9-0" not in used


def test_below_min_improvement_returns_no_transfers() -> None:
    items = [_item("solo", 2.0)]
    slots = [_slot("0-0-0-0", 1, 1, 1)]
    result = optimize_slotting(
        items,
        slots,
        seed=3,
        max_candidates=10,
        top_k=5,
        min_improvement=0.05,
    )
    assert result.improvement < 0.05
    assert result.below_min_improvement is True
    assert result.transfers == []
    assert result.top
    assert result.top[0].below_min_improvement is True


def test_travel_scales_return_raw_ratio_and_clamped_scale() -> None:
    scales = travel_scales(20.0, 2.0, 0.1)
    assert scales.raw["random"] == 10.0
    assert scales.clamped["random"] == 4.0
    assert scales.raw["ai"] == 0.05
    assert scales.clamped["ai"] == 0.25
    assert scales.clamped["nearest"] == 1.0
    assert scales.raw["nearest"] == 1.0


def test_slot_key_bounds_follow_layout_geometry() -> None:
    geometry = LayoutGeometryV1(rows=8, levels=3, cellX=12, cellZ=1)
    assert slot_key_within_geometry("0-0-0-0", geometry) is True
    assert slot_key_within_geometry("11-0-0-0", geometry) is False
    assert slot_key_within_geometry("not-a-slot", geometry) is False
