"""Структуры счётчика слоттинга. Модели склада и KPI DES сюда не копируются."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.simulation.des_engine import SimulationKpis


@dataclass(frozen=True)
class GridSlot:
    slot_key: str
    row: int
    level: int
    cell_x: int
    cell_z: int


@dataclass(frozen=True)
class MovableItem:
    item_id: str
    current_slot_key: str | None
    velocity: float
    row: int
    level: int
    cell_x: int
    cell_z: int


@dataclass(frozen=True)
class Assignment:
    item_id: str
    current_slot_key: str | None
    velocity: float
    slot_key: str
    row: int
    travel: float
    score: float


@dataclass(frozen=True)
class PolicyPath:
    putaway_rule: str
    mean_path: float
    raw_path_ratio: float
    layout_travel_scale: float


@dataclass(frozen=True)
class RankedMove:
    """Пара item → slot_key, пригодная как аргументы create_transfer_task."""

    item_id: str
    slot_key: str
    current_slot_key: str | None
    score: float
    travel: float
    below_min_improvement: bool
    task_type: str = "move"
    priority: int = 0
    note: str = ""

    def as_dict(self) -> dict[str, object]:
        return {
            "item_id": self.item_id,
            "slot_key": self.slot_key,
            "current_slot_key": self.current_slot_key,
            "score": self.score,
            "travel": self.travel,
            "below_min_improvement": self.below_min_improvement,
            "task_type": self.task_type,
            "priority": self.priority,
            "note": self.note,
        }


@dataclass
class SlottingRecommendation:
    top: list[RankedMove] = field(default_factory=list)
    transfers: list[RankedMove] = field(default_factory=list)
    below_min_improvement: bool = True
    improvement: float = 0.0
    paths: dict[str, PolicyPath] = field(default_factory=dict)

    def as_dict(self) -> dict[str, object]:
        return {
            "top": [row.as_dict() for row in self.top],
            "transfers": [row.as_dict() for row in self.transfers],
            "below_min_improvement": self.below_min_improvement,
            "improvement": self.improvement,
            "mean_path": {name: path.mean_path for name, path in self.paths.items()},
            "raw_path_ratio": {
                name: path.raw_path_ratio for name, path in self.paths.items()
            },
            "layout_travel_scale": {
                name: path.layout_travel_scale for name, path in self.paths.items()
            },
        }


@dataclass
class SlottingCompareResult:
    simulation_enabled: bool
    recommendation: SlottingRecommendation
    kpis: dict[str, SimulationKpis | None]


def policy_block(
    name: str,
    recommendation: SlottingRecommendation,
    kpis: SimulationKpis | None,
) -> dict[str, object]:
    path = recommendation.paths[name]
    kpi_payload: dict[str, object] | None
    if kpis is None:
        kpi_payload = None
    else:
        from dataclasses import asdict

        kpi_payload = asdict(kpis)
    return {
        "putaway_rule": path.putaway_rule,
        "mean_path": path.mean_path,
        "raw_path_ratio": path.raw_path_ratio,
        "layout_travel_scale": path.layout_travel_scale,
        "kpis": kpi_payload,
    }


def compare_result_dict(result: SlottingCompareResult) -> dict[str, object]:
    rec = result.recommendation
    return {
        "simulation_enabled": result.simulation_enabled,
        "below_min_improvement": rec.below_min_improvement,
        "improvement": rec.improvement,
        "random": policy_block("random", rec, result.kpis.get("random")),
        "nearest": policy_block("nearest", rec, result.kpis.get("nearest")),
        "ai": policy_block("ai", rec, result.kpis.get("ai")),
        "recommendations": [row.as_dict() for row in rec.transfers],
        "top": [row.as_dict() for row in rec.top],
    }
