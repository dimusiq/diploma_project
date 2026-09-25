"""Три политики DES на одном SimulationConfig. Своего цикла событий нет."""

from __future__ import annotations

from dataclasses import replace
from typing import TYPE_CHECKING

from sqlmodel import Session

from app.core.config import settings
from app.models import User
from app.optimization.schemas import SlottingCompareResult
from app.optimization.slotting import recommend
from app.simulation.des_engine import (
    SimulationConfig,
    SimulationResult,
    run_discrete_event_simulation,
)

if TYPE_CHECKING:
    from app.api.routes.warehouse_simulation import SimulationRunBody


def policy_configs(
    base_cfg: SimulationConfig,
    scales: dict[str, float],
) -> dict[str, SimulationConfig]:
    """Меняются только putaway_rule и layout_travel_scale."""
    return {
        "random": replace(
            base_cfg,
            putaway_rule="random",
            layout_travel_scale=scales["random"],
        ),
        "nearest": replace(
            base_cfg,
            putaway_rule="nearest",
            layout_travel_scale=scales["nearest"],
        ),
        "ai": replace(
            base_cfg,
            putaway_rule="nearest",
            layout_travel_scale=scales["ai"],
        ),
    }


def compare(
    session: Session,
    user: User,
    body: SimulationRunBody,
    scales: dict[str, float],
) -> dict[str, SimulationResult]:
    from app.api.routes.warehouse_simulation import simulation_config_from_run_body

    base_body = body.model_copy(update={"layout_travel_scale": 1.0, "putaway_rule": "nearest"})
    base_cfg, _twin_meta = simulation_config_from_run_body(session, user, base_body)
    specs = policy_configs(base_cfg, scales)
    return {name: run_discrete_event_simulation(cfg) for name, cfg in specs.items()}


def compare_policies(
    session: Session,
    user: User,
    body: SimulationRunBody,
) -> SlottingCompareResult:
    recommendation = recommend(
        session,
        user,
        warehouse_id=body.warehouse_id,
        seed=int(body.seed),
    )
    scales = {
        name: recommendation.paths[name].layout_travel_scale
        for name in ("random", "nearest", "ai")
    }
    if not bool(settings.AI_SLOTTING_SIMULATION_ENABLED):
        return SlottingCompareResult(
            simulation_enabled=False,
            recommendation=recommendation,
            kpis={"random": None, "nearest": None, "ai": None},
        )
    results = compare(session, user, body, scales)
    return SlottingCompareResult(
        simulation_enabled=True,
        recommendation=recommendation,
        kpis={name: results[name].kpis for name in ("random", "nearest", "ai")},
    )
