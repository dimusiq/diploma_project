"""Дискретно-событийная симуляция склада и KPI (sandbox «что если»)."""

from app.simulation.des_engine import SimulationConfig, run_discrete_event_simulation
from app.simulation.kpi_snapshot import build_kpi_snapshot

__all__ = [
    "SimulationConfig",
    "build_kpi_snapshot",
    "run_discrete_event_simulation",
]
