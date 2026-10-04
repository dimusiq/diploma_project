"""P3-17: стратегии размещения (ABC, дозаполнение, вместимость)."""

from __future__ import annotations

from app.services.putaway_strategy import (
    PutawayStrategyConfig,
    SlotCandidate,
    can_place_in_slot,
    choose_best_slot,
    parse_strategy_name,
    resolve_abc_class,
    score_slot_for_abc,
)


def test_abc_a_prefers_nearer_than_c() -> None:
    near = SlotCandidate(
        storage_row=1, storage_level=1, storage_cell_x=1, capacity_qty=1
    )
    far = SlotCandidate(
        storage_row=16, storage_level=4, storage_cell_x=20, capacity_qty=1
    )
    best_a = choose_best_slot(
        [near, far],
        abc_class="A",
        put_qty=1,
        put_sku="SKU-A",
        prefer_top_up=False,
    )
    best_c = choose_best_slot(
        [near, far],
        abc_class="C",
        put_qty=1,
        put_sku="SKU-C",
        prefer_top_up=False,
    )
    assert best_a is not None and best_c is not None
    assert best_a.storage_row < best_c.storage_row
    assert score_slot_for_abc("A", storage_row=1, storage_level=1, storage_cell_x=1) < (
        score_slot_for_abc("A", storage_row=16, storage_level=1, storage_cell_x=1)
    )


def test_top_up_same_sku_preferred() -> None:
    empty_near = SlotCandidate(
        storage_row=1, storage_level=1, storage_cell_x=1, capacity_qty=1
    )
    occupied_same = SlotCandidate(
        storage_row=8,
        storage_level=2,
        storage_cell_x=5,
        current_qty=3,
        current_sku="SKU-1",
        capacity_qty=10,
    )
    chosen = choose_best_slot(
        [empty_near, occupied_same],
        abc_class="A",
        put_qty=2,
        put_sku="SKU-1",
        prefer_top_up=True,
    )
    assert chosen is occupied_same
    assert chosen.storage_row == 8


def test_cell_not_overfilled() -> None:
    full = SlotCandidate(
        storage_row=2,
        storage_level=1,
        storage_cell_x=2,
        current_qty=10,
        current_sku="SKU-1",
        capacity_qty=10,
    )
    empty = SlotCandidate(
        storage_row=3, storage_level=1, storage_cell_x=3, capacity_qty=1
    )
    assert (
        can_place_in_slot(
            put_qty=1,
            put_sku="SKU-1",
            put_category_id=None,
            put_weight_kg=None,
            candidate=full,
            allow_sku_mix=False,
            heavy_weight_kg=50,
            max_level_for_heavy=2,
        )
        is False
    )
    chosen = choose_best_slot(
        [full, empty],
        abc_class="A",
        put_qty=1,
        put_sku="SKU-1",
        prefer_top_up=True,
    )
    assert chosen is empty


def test_no_sku_mix_and_heavy_not_on_top() -> None:
    mixed = SlotCandidate(
        storage_row=1,
        storage_level=1,
        storage_cell_x=1,
        current_qty=1,
        current_sku="OTHER",
        capacity_qty=10,
    )
    high = SlotCandidate(
        storage_row=2, storage_level=4, storage_cell_x=1, capacity_qty=1
    )
    low = SlotCandidate(
        storage_row=2, storage_level=1, storage_cell_x=2, capacity_qty=1
    )
    assert (
        can_place_in_slot(
            put_qty=1,
            put_sku="SKU-X",
            put_category_id=None,
            put_weight_kg=None,
            candidate=mixed,
            allow_sku_mix=False,
            heavy_weight_kg=50,
            max_level_for_heavy=2,
        )
        is False
    )
    chosen = choose_best_slot(
        [high, low],
        abc_class="A",
        put_qty=1,
        put_sku="HEAVY",
        put_weight_kg=80.0,
        config=PutawayStrategyConfig(heavy_weight_kg=50.0, max_level_for_heavy=2),
        prefer_top_up=False,
    )
    assert chosen is low


def test_resolve_abc_and_strategy_aliases() -> None:
    assert resolve_abc_class(sku="X", abc_by_sku={}, explicit=None) == "C"
    assert resolve_abc_class(sku="X", abc_by_sku={"X": "A"}, explicit=None) == "A"
    assert resolve_abc_class(sku="X", abc_by_sku={"X": "C"}, explicit="B") == "B"
    assert parse_strategy_name("abc") == "top_up_then_abc"
    assert parse_strategy_name("nearest") == "nearest_empty"
    assert parse_strategy_name(None) == "top_up_then_abc"
