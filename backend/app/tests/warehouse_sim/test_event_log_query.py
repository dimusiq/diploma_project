"""query_event_log: пагинация merge/slice; annotate_event_orders (уникальные resolve)."""

from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import MagicMock

import pytest

from app.services.outbound_fulfillment import annotate_event_orders
from app.warehouse_sim.runtime import WarehouseSimRuntime, query_event_log
from app.warehouse_sim.simulation import advance_world
from app.warehouse_sim.snapshot import build_kpi
from app.warehouse_sim.world import create_world


def test_world_seed_reproducible_kpi_after_advance() -> None:
    def run(seed: int) -> dict[str, Any]:
        world = create_world(
            {"seed": seed, "faultRatePerHour": 0.0, "initialFillRatio": 0.3}
        )
        advance_world(world, 45.0)
        return build_kpi(world, "RUNNING")

    assert run(2026) == run(2026)


def test_annotate_event_orders_one_resolve_per_unique_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Не N вызовов на N одинаковых orderId — кэш token→id; на каждый unique — 1 lookup."""
    calls: list[str] = []
    oid = uuid.uuid4()

    def fake_resolve(_session: object, token: str) -> uuid.UUID | None:
        calls.append(token)
        return oid if token == "sim-A" else None

    monkeypatch.setattr(
        "app.services.outbound_fulfillment.resolve_outbound_id",
        fake_resolve,
    )
    events: list[dict[str, Any]] = [
        {"id": 1, "orderId": "sim-A"},
        {"id": 2, "orderId": "sim-A"},
        {"id": 3, "orderId": "sim-B"},
        {"id": 4},
    ]
    out = annotate_event_orders(MagicMock(), events)
    assert calls == ["sim-A", "sim-B"]
    assert out[0]["wmsOrderId"] == str(oid)
    assert out[1]["wmsOrderId"] == str(oid)
    assert "wmsOrderId" not in out[2]
    assert "wmsOrderId" not in out[3]
    # Исходные события не мутируются
    assert "wmsOrderId" not in events[0]


def test_query_event_log_uses_sql_offset_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Без SENSOR_READING — чистый SQL OFFSET/LIMIT (не fetch 2000 + slice)."""
    rt = WarehouseSimRuntime()
    memory = [
        {
            "id": i,
            "at": float(i),
            "type": "info.tick",
            "severity": "info",
            "message": f"evt-{i}",
        }
        for i in range(1, 6)
    ]
    rt.mutate_world(lambda w: w.__setitem__("events", list(memory)))

    monkeypatch.setattr(
        "app.warehouse_sim.runtime.persist_new_sim_events",
        lambda *_a, **_k: 0,
    )
    monkeypatch.setattr(
        "app.warehouse_sim.runtime.annotate_event_orders",
        lambda _s, events: events,
    )

    class _Row:
        def __init__(self, seq: int) -> None:
            self.seq = seq
            self.sim_time_sec = float(seq)
            self.event_type = "info.tick"
            self.severity = "info"
            self.message = f"evt-{seq}"
            self.payload: dict[str, Any] = {}

    sqls: list[str] = []
    session = MagicMock()

    def _exec(stmt: Any) -> MagicMock:
        try:
            sqls.append(
                str(stmt.compile(compile_kwargs={"literal_binds": True})).upper()
            )
        except Exception:
            sqls.append(str(stmt).upper())
        result = MagicMock()
        result.one.return_value = 100
        # Страница offset=5 limit=3 → имитируем три строки из БД
        result.all.return_value = [_Row(15), _Row(14), _Row(13)]
        return result

    session.exec.side_effect = _exec

    page = query_event_log(session, rt, skip=5, limit=3)
    assert [e["id"] for e in page["data"]] == [15, 14, 13]
    assert page["count"] == 100
    data_sql = [s for s in sqls if "WSIM_EVENT" in s and "COUNT" not in s]
    assert data_sql, sqls
    assert any("OFFSET" in s and "LIMIT" in s for s in data_sql)


def test_query_event_log_sensors_merge_then_slice(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """С SENSOR_READING: LIMIT skip+limit из БД + merge + Python slice страницы."""
    from app.warehouse_sim import events as ev

    rt = WarehouseSimRuntime()
    memory = [
        {
            "id": 100,
            "at": 100.0,
            "type": ev.SENSOR_READING,
            "severity": "info",
            "message": "s100",
        },
        {
            "id": 50,
            "at": 50.0,
            "type": ev.SENSOR_READING,
            "severity": "info",
            "message": "s50",
        },
    ]
    rt.mutate_world(lambda w: w.__setitem__("events", list(memory)))
    monkeypatch.setattr(
        "app.warehouse_sim.runtime.persist_new_sim_events",
        lambda *_a, **_k: 0,
    )
    monkeypatch.setattr(
        "app.warehouse_sim.runtime.annotate_event_orders",
        lambda _s, events: events,
    )

    class _Row:
        def __init__(self, seq: int) -> None:
            self.seq = seq
            self.sim_time_sec = float(seq)
            self.event_type = "task.done"
            self.severity = "info"
            self.message = f"db-{seq}"
            self.payload: dict[str, Any] = {}

    sqls: list[str] = []
    session = MagicMock()

    def _exec(stmt: Any) -> MagicMock:
        try:
            sqls.append(
                str(stmt.compile(compile_kwargs={"literal_binds": True})).upper()
            )
        except Exception:
            sqls.append(str(stmt).upper())
        result = MagicMock()
        result.one.return_value = 3
        # skip=1 limit=2 → LIMIT 3 без OFFSET
        result.all.return_value = [_Row(90), _Row(80), _Row(70)]
        return result

    session.exec.side_effect = _exec
    page = query_event_log(session, rt, skip=1, limit=2)
    assert page["count"] == 5  # 3 db + 2 sensors
    assert [e["id"] for e in page["data"]] == [90, 80]
    data_sql = [s for s in sqls if "WSIM_EVENT" in s and "COUNT" not in s]
    assert any("LIMIT" in s and "OFFSET" not in s for s in data_sql)


def test_query_event_log_count_sensors_and_filters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.warehouse_sim import events as ev

    rt = WarehouseSimRuntime()
    memory = [
        {
            "id": 1,
            "at": 1.0,
            "type": ev.SENSOR_READING,
            "severity": "info",
            "message": "temp",
            "deviceId": "dev-1",
        },
        {
            "id": 2,
            "at": 2.0,
            "type": "task.done",
            "severity": "info",
            "message": "ok",
            "deviceId": "dev-2",
        },
        {
            "id": 3,
            "at": 3.0,
            "type": ev.SENSOR_READING,
            "severity": "warning",
            "message": "hot",
            "deviceId": "dev-1",
        },
    ]
    rt.mutate_world(lambda w: w.__setitem__("events", list(memory)))
    monkeypatch.setattr(
        "app.warehouse_sim.runtime.persist_new_sim_events",
        lambda *_a, **_k: 0,
    )
    monkeypatch.setattr(
        "app.warehouse_sim.runtime.annotate_event_orders",
        lambda _s, events: events,
    )
    session = MagicMock()
    session.exec.side_effect = lambda _stmt: MagicMock(one=lambda: 0, all=lambda: [])

    all_page = query_event_log(session, rt, skip=0, limit=50)
    assert all_page["count"] == 2  # два SENSOR_READING
    assert len(all_page["data"]) == 3

    filtered = query_event_log(
        session, rt, skip=0, limit=50, device_id="dev-1", severity="warning"
    )
    assert [e["id"] for e in filtered["data"]] == [3]
