"""Три SimulationConfig слоттинга делят вход и отличаются правилом и масштабом пути."""

from dataclasses import fields

from app.optimization.scoring import travel_scales
from app.optimization.simulation_compare import policy_configs
from app.simulation.des_engine import SimulationConfig, run_discrete_event_simulation


def test_three_policies_share_inputs_and_clamp_travel_scale() -> None:
    base = SimulationConfig(
        duration_hours=0.05,
        seed=7,
        dock_bays=2,
        num_forklifts=3,
        num_operators=4,
        truck_arrival_rate_per_hour=1.0,
        mean_dock_service_min=10.0,
        pick_orders_per_hour=2.0,
        mean_pick_duration_min=2.0,
        mean_putaway_duration_min=3.0,
        replenishment_trips_per_hour=1.0,
        mean_replenishment_min=4.0,
        sandbox_extra_putaway_min=0.5,
        initial_dock_queue=1,
        initial_putaway_queue=2,
        initial_pick_queue=3,
    )
    scales = travel_scales(4.0, 2.0, 1.0)
    specs = policy_configs(base, scales.clamped)
    shared = {
        field.name
        for field in fields(SimulationConfig)
        if field.name not in {"putaway_rule", "layout_travel_scale"}
    }
    for name in shared:
        values = {getattr(specs[policy], name) for policy in ("random", "nearest", "ai")}
        assert len(values) == 1, name

    assert specs["random"].putaway_rule == "random"
    assert specs["nearest"].putaway_rule == "nearest"
    assert specs["ai"].putaway_rule == "nearest"
    assert specs["nearest"].layout_travel_scale == 1.0
    assert specs["ai"].layout_travel_scale != specs["nearest"].layout_travel_scale
    for cfg in specs.values():
        assert 0.25 <= cfg.layout_travel_scale <= 4.0
        run_discrete_event_simulation(cfg)
