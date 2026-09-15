"""Детерминированный ГПСЧ (mulberry32), как во фронтенд-прототипе."""

from __future__ import annotations

import math
from typing import Any, Sequence, TypeVar

T = TypeVar("T")


def _state(holder: Any) -> int:
    if isinstance(holder, dict):
        return int(holder["rng_state"])
    return int(holder.rng_state)


def _set_state(holder: Any, value: int) -> None:
    value &= 0xFFFFFFFF
    if isinstance(holder, dict):
        holder["rng_state"] = value
    else:
        holder.rng_state = value


def _i32(n: int) -> int:
    n &= 0xFFFFFFFF
    return n - 0x100000000 if n >= 0x80000000 else n


def next_random(holder: Any) -> float:
    t = _i32(_state(holder) + 0x6D2B79F5)
    _set_state(holder, t & 0xFFFFFFFF)
    t = _i32((t ^ (t >> 15)) * (t | 1))
    t = _i32(t ^ (t + _i32((t ^ (t >> 7)) * (t | 61))))
    return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296


def rand_range(holder: Any, min_v: float, max_v: float) -> float:
    return min_v + next_random(holder) * (max_v - min_v)


def rand_int(holder: Any, min_v: int, max_v: int) -> int:
    return int(math.floor(rand_range(holder, min_v, max_v + 1)))


def rand_chance(holder: Any, probability: float) -> bool:
    return next_random(holder) < probability


def rand_pick(holder: Any, items: Sequence[T]) -> T:
    if not items:
        raise ValueError("rand_pick: empty sequence")
    idx = min(len(items) - 1, int(math.floor(next_random(holder) * len(items))))
    return items[idx]


def event_occurs(holder: Any, rate_per_hour: float, dt_sec: float) -> bool:
    if rate_per_hour <= 0:
        return False
    lam = rate_per_hour / 3600.0
    return rand_chance(holder, 1.0 - math.exp(-lam * dt_sec))


def rand_normal(
    holder: Any, mean: float, sd: float, min_v: float, max_v: float
) -> float:
    u1 = max(1e-9, next_random(holder))
    u2 = next_random(holder)
    z = math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)
    return min(max_v, max(min_v, mean + z * sd))
