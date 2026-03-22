"""Начальное заполнение очередей DES из SimulationConfig."""

from app.simulation.des_engine import SimulationConfig, run_discrete_event_simulation


def test_initial_queues_increase_max_and_process() -> None:
    cfg = SimulationConfig(
        duration_hours=0.05,
        seed=1,
        truck_arrival_rate_per_hour=0.0,
        pick_orders_per_hour=0.0,
        replenishment_trips_per_hour=0.0,
        initial_dock_queue=2,
        initial_putaway_queue=1,
        initial_pick_queue=1,
    )
    r = run_discrete_event_simulation(cfg)
    assert r.kpis.max_dock_queue >= 2
    assert r.kpis.max_putaway_queue >= 1
    assert r.kpis.max_pick_queue >= 1
    # Короткий горизонт: события ставятся в кучу, но часть обработки уже в try_* при t=0.
    assert r.kpis.mean_dock_turnaround_min is not None
