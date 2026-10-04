"""mulberry32: детерминизм, границы, пустой pick."""

from __future__ import annotations

from typing import Any

import pytest

from app.warehouse_sim.rng import (
    event_occurs,
    next_random,
    rand_chance,
    rand_int,
    rand_normal,
    rand_pick,
    rand_range,
)


def test_mulberry32_sequence_deterministic() -> None:
    a: dict[str, Any] = {"rng_state": 0xC0FFEE}
    b: dict[str, Any] = {"rng_state": 0xC0FFEE}
    seq_a = [next_random(a) for _ in range(32)]
    seq_b = [next_random(b) for _ in range(32)]
    assert seq_a == seq_b
    assert all(0.0 <= x < 1.0 for x in seq_a)
    # Состояние продвинулось одинаково
    assert a["rng_state"] == b["rng_state"]
    assert a["rng_state"] != 0xC0FFEE


def test_mulberry32_known_first_draw() -> None:
    """Зафиксированный первый draw для seed=1 (контракт mulberry32 / JS-прототип)."""
    h: dict[str, Any] = {"rng_state": 1}
    x = next_random(h)
    # Точное значение: смена алгоритма / сдвиг констант mulberry32 ломает тест.
    assert x == pytest.approx(0.025473770452663302, rel=0, abs=1e-15)
    assert h["rng_state"] == 1831565814
    h2: dict[str, Any] = {"rng_state": 1}
    assert next_random(h2) == x
    assert next_random(h2) == pytest.approx(0.1281359081622213, rel=0, abs=1e-15)


def test_rand_helpers_bounds() -> None:
    h: dict[str, Any] = {"rng_state": 42}
    assert 1.0 <= rand_range(h, 1.0, 2.0) <= 2.0
    n = rand_int(h, 3, 7)
    assert 3 <= n <= 7
    assert rand_pick(h, ("a", "b", "c")) in ("a", "b", "c")
    assert isinstance(rand_chance(h, 0.5), bool)
    assert 0.0 <= rand_normal(h, 5.0, 1.0, 0.0, 10.0) <= 10.0


def test_rand_pick_empty_raises() -> None:
    with pytest.raises(ValueError, match="empty"):
        rand_pick({"rng_state": 1}, [])


def test_event_occurs_zero_rate() -> None:
    assert event_occurs({"rng_state": 1}, 0.0, 3600.0) is False
