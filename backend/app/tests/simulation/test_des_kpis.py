"""DES KPI: otif_proxy / utilization в [0,1], воспроизводимость по seed."""

from __future__ import annotations

from dataclasses import replace

from app.simulation.des_engine import SimulationConfig, run_discrete_event_simulation


def _busy_cfg(*, seed: int) -> SimulationConfig:
    return SimulationConfig(
        duration_hours=1.0,
        seed=seed,
        truck_arrival_rate_per_hour=4.0,
        pick_orders_per_hour=80.0,
        replenishment_trips_per_hour=6.0,
        num_forklifts=3,
        num_operators=4,
        dock_bays=2,
    )


def test_des_kpis_seed_reproducible() -> None:
    cfg = _busy_cfg(seed=31415)
    a = run_discrete_event_simulation(cfg)
    b = run_discrete_event_simulation(cfg)
    assert a.kpis == b.kpis
    assert a.horizon_minutes == b.horizon_minutes


def test_des_utilization_and_otif_bounds() -> None:
    r = run_discrete_event_simulation(_busy_cfg(seed=7))
    k = r.kpis
    assert 0.0 <= k.forklift_utilization <= 1.0
    assert 0.0 <= k.operator_utilization <= 1.0
    assert 0.0 <= k.dock_utilization <= 1.0
    assert 0.0 <= k.otif_proxy <= 1.0
    assert 0.0 <= k.late_pick_fraction <= 1.0
    assert k.events_processed > 0
    # При наличии picks otif = 1 - late_fraction (с округлением)
    if k.late_pick_fraction == 0.0:
        assert k.otif_proxy == 1.0


def test_des_different_seed_changes_trace() -> None:
    a = run_discrete_event_simulation(_busy_cfg(seed=11))
    b = run_discrete_event_simulation(replace(_busy_cfg(seed=11), seed=12))
    assert (
        a.kpis.events_processed,
        a.kpis.otif_proxy,
        a.kpis.forklift_utilization,
    ) != (
        b.kpis.events_processed,
        b.kpis.otif_proxy,
        b.kpis.forklift_utilization,
    )


def test_des_otif_without_picks_is_one() -> None:
    cfg = SimulationConfig(
        duration_hours=0.05,
        seed=1,
        truck_arrival_rate_per_hour=0.0,
        pick_orders_per_hour=0.0,
        replenishment_trips_per_hour=0.0,
        initial_pick_queue=0,
    )
    r = run_discrete_event_simulation(cfg)
    assert r.kpis.otif_proxy == 1.0
    assert r.kpis.late_pick_fraction == 0.0
