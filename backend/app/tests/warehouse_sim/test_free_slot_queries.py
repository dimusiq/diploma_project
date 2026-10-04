"""Число запросов _free_slot на событие item: кэш occupied на батч."""

from __future__ import annotations

from typing import Any

from unittest.mock import MagicMock
from uuid import uuid4

from app.warehouse_sim.integration import _DomainCtx, _free_slot


def test_free_slot_reuses_occupied_cache_within_batch() -> None:
    session = MagicMock()
    # Первый occupied_slots(): один SELECT с координатами
    session.exec.return_value.all.return_value = [
        (1, 1, 1, 1),
        (1, 1, 2, 1),
    ]
    # get(Item) для exclude — пусто
    session.get.return_value = None
    # LIMIT-проверка preferred: слот свободен / занят
    session.exec.return_value.first.return_value = None

    world: dict[str, Any] = {"bridge": {}}
    ctx = _DomainCtx(session, world, warehouse_id=uuid4(), actor_id=uuid4())

    # Три назначения подряд в одном батче
    a = _free_slot(ctx, (2, 1, 1, 1), exclude=uuid4())
    b = _free_slot(ctx, (2, 1, 2, 1), exclude=uuid4())
    c = _free_slot(ctx, None, exclude=uuid4())
    assert a == (2, 1, 1, 1)
    assert b == (2, 1, 2, 1)
    assert c is not None

    # До: каждый _free_slot делал полный SELECT (~3).
    # После: 1 load occupied + точечные LIMIT на preferred (≤2) ≪ 3 полных скана.
    assert ctx._slot_queries <= 3
    # Кэш построен один раз
    assert ctx._occupied_slots is not None
    assert len(ctx._occupied_slots) >= 3
