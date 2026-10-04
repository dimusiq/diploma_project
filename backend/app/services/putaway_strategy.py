"""
Стратегии размещения (putaway) с учётом ABC, дозаполнения и вместимости.

Дефолт: ``top_up_then_abc`` — сначала дозаполнение той же SKU (без переполнения),
иначе свободная ячейка с скорингом ABC (A ближе к воротам / ниже, C дальше / выше).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, cast
from uuid import UUID

from sqlmodel import Session, col, select

from app.core.storage_slot import format_storage_slot_key
from app.models import Item, StorageBin, Warehouse
from app.services.abc_classification import abc_class_by_sku

PutawayStrategyName = Literal["top_up_then_abc", "abc_nearest", "nearest_empty"]
DEFAULT_STRATEGY: PutawayStrategyName = "top_up_then_abc"
ABCClass = Literal["A", "B", "C"]
_ABC_VALUES = frozenset({"A", "B", "C"})

# Соглашение о близости к воротам: меньший storage_row и cell_x — ближе к доку.
MAX_ROW = 16
MAX_LEVEL = 4
MAX_CELL_X = 20


@dataclass(frozen=True)
class PutawayStrategyConfig:
    name: PutawayStrategyName = DEFAULT_STRATEGY
    allow_sku_mix: bool = False
    default_bin_capacity_qty: int = 100
    heavy_weight_kg: float = 50.0
    max_level_for_heavy: int = 2
    abc_period_days: int = 90


@dataclass
class SlotCandidate:
    storage_row: int
    storage_level: int
    storage_cell_x: int
    storage_cell_z: int = 1
    storage_bin_id: str | None = None
    current_qty: int = 0
    current_sku: str | None = None
    current_category_id: str | None = None
    capacity_qty: int = 100
    max_weight_kg: float | None = None

    @property
    def slot_key(self) -> str:
        key = format_storage_slot_key(
            self.storage_row,
            self.storage_level,
            self.storage_cell_x,
            self.storage_cell_z,
        )
        return key or ""

    @property
    def remaining_qty(self) -> int:
        return max(0, self.capacity_qty - self.current_qty)


_STRATEGY_ALIASES: dict[str, PutawayStrategyName] = {
    "top_up_then_abc": "top_up_then_abc",
    "abc_nearest": "abc_nearest",
    "nearest_empty": "nearest_empty",
    "abc": "top_up_then_abc",
    "nearest": "nearest_empty",
}


def parse_strategy_name(raw: str | None) -> PutawayStrategyName:
    if not raw:
        return DEFAULT_STRATEGY
    return _STRATEGY_ALIASES.get(str(raw).strip().lower(), DEFAULT_STRATEGY)


def _as_abc(value: str | None) -> ABCClass | None:
    if value is None:
        return None
    up = str(value).strip().upper()
    if up in _ABC_VALUES:
        return cast(ABCClass, up)
    return None


def resolve_abc_class(
    *,
    sku: str | None,
    abc_by_sku: dict[str, str],
    explicit: str | None = None,
) -> ABCClass:
    for candidate in (explicit, abc_by_sku.get(sku or "") if sku else None):
        parsed = _as_abc(candidate)
        if parsed is not None:
            return parsed
    return "C"


def score_slot_for_abc(
    abc_class: ABCClass,
    *,
    storage_row: int,
    storage_level: int,
    storage_cell_x: int,
    heavy: bool = False,
) -> float:
    """
    Меньше = лучше.
    A: ближе к воротам (малый row/x) и ниже (level 1).
    C: дальше от ворот и выше.
    B: компромисс.
    """
    if heavy and storage_level > 2:
        return 1e9

    near = float(storage_row) * 1000.0 + float(storage_cell_x) * 10.0
    height = float(storage_level) * 100.0

    if abc_class == "A":
        return near + height
    if abc_class == "C":
        # инверсия близости: дальний ряд предпочтительнее
        far = (
            float(MAX_ROW - storage_row + 1) * 1000.0
            + float(MAX_CELL_X - storage_cell_x + 1) * 10.0
        )
        return far + (MAX_LEVEL - storage_level + 1) * 50.0
    # B
    return near * 0.5 + height * 0.8 + abs(storage_row - MAX_ROW / 2) * 20.0


def can_place_in_slot(
    *,
    put_qty: int,
    put_sku: str | None,
    put_category_id: str | None,
    put_weight_kg: float | None,
    candidate: SlotCandidate,
    allow_sku_mix: bool,
    heavy_weight_kg: float,
    max_level_for_heavy: int,
) -> bool:
    if put_qty <= 0:
        return False
    if put_qty > candidate.remaining_qty:
        return False
    if candidate.current_qty > 0:
        if not allow_sku_mix:
            if candidate.current_sku and put_sku and candidate.current_sku != put_sku:
                return False
            if (
                candidate.current_category_id
                and put_category_id
                and candidate.current_category_id != put_category_id
                and (
                    not candidate.current_sku
                    or not put_sku
                    or candidate.current_sku != put_sku
                )
            ):
                return False
        elif candidate.current_sku and put_sku and candidate.current_sku != put_sku:
            # mix запрещён на уровне SKU даже при allow_sku_mix=False already handled;
            # при allow_sku_mix=True разрешаем, но не смешиваем категории
            if (
                candidate.current_category_id
                and put_category_id
                and candidate.current_category_id != put_category_id
            ):
                return False
    if put_weight_kg is not None and put_weight_kg >= heavy_weight_kg:
        if candidate.storage_level > max_level_for_heavy:
            return False
    if (
        put_weight_kg is not None
        and candidate.max_weight_kg is not None
        and put_weight_kg > candidate.max_weight_kg
    ):
        return False
    return True


def choose_best_slot(
    candidates: list[SlotCandidate],
    *,
    abc_class: ABCClass,
    put_qty: int,
    put_sku: str | None,
    put_category_id: str | None = None,
    put_weight_kg: float | None = None,
    config: PutawayStrategyConfig | None = None,
    prefer_top_up: bool = True,
) -> SlotCandidate | None:
    cfg = config or PutawayStrategyConfig()
    heavy = put_weight_kg is not None and put_weight_kg >= cfg.heavy_weight_kg

    feasible = [
        c
        for c in candidates
        if can_place_in_slot(
            put_qty=put_qty,
            put_sku=put_sku,
            put_category_id=put_category_id,
            put_weight_kg=put_weight_kg,
            candidate=c,
            allow_sku_mix=cfg.allow_sku_mix,
            heavy_weight_kg=cfg.heavy_weight_kg,
            max_level_for_heavy=cfg.max_level_for_heavy,
        )
    ]
    if not feasible:
        return None

    if prefer_top_up and put_sku:
        top_ups = [
            c for c in feasible if c.current_qty > 0 and c.current_sku == put_sku
        ]
        if top_ups:
            return min(
                top_ups,
                key=lambda c: (
                    -c.remaining_qty,
                    score_slot_for_abc(
                        abc_class,
                        storage_row=c.storage_row,
                        storage_level=c.storage_level,
                        storage_cell_x=c.storage_cell_x,
                        heavy=heavy,
                    ),
                ),
            )

    empties = [c for c in feasible if c.current_qty == 0]
    pool = empties or feasible
    return min(
        pool,
        key=lambda c: score_slot_for_abc(
            abc_class,
            storage_row=c.storage_row,
            storage_level=c.storage_level,
            storage_cell_x=c.storage_cell_x,
            heavy=heavy,
        ),
    )


def config_from_warehouse(warehouse: Warehouse | None) -> PutawayStrategyConfig:
    """Стратегия из Warehouse — пока константа/будущий extra; расширяемо без миграции."""
    _ = warehouse
    return PutawayStrategyConfig()


def config_from_order_extra(extra: dict[str, Any] | None) -> PutawayStrategyConfig:
    base = PutawayStrategyConfig()
    if not isinstance(extra, dict):
        return base
    raw = extra.get("putaway_strategy") or (extra.get("fulfillment") or {}).get(
        "putaway_strategy"
    )
    name = parse_strategy_name(str(raw) if raw else None)
    allow_mix = bool(extra.get("allow_sku_mix", base.allow_sku_mix))
    return PutawayStrategyConfig(name=name, allow_sku_mix=allow_mix)


def _bin_capacity(sbin: StorageBin | None, default: int) -> int:
    if sbin is None:
        return default
    if isinstance(sbin.extra, dict) and sbin.extra.get("max_qty") is not None:
        try:
            return max(1, int(sbin.extra["max_qty"]))
        except (TypeError, ValueError):
            pass
    return default


def _occupied_coords(session: Session) -> dict[tuple[int, int, int, int], Item]:
    out: dict[tuple[int, int, int, int], Item] = {}
    for item in session.exec(
        select(Item).where(
            Item.status == "warehouse",
            col(Item.storage_row).is_not(None),
            col(Item.storage_level).is_not(None),
            col(Item.storage_cell_x).is_not(None),
        )
    ).all():
        key = (
            int(item.storage_row or 0),
            int(item.storage_level or 0),
            int(item.storage_cell_x or 0),
            int(item.storage_cell_z or 1),
        )
        out[key] = item
    return out


def _build_candidates(
    session: Session,
    *,
    warehouse_id: UUID,
    config: PutawayStrategyConfig,
) -> list[SlotCandidate]:
    occupied = _occupied_coords(session)
    bins = list(
        session.exec(
            select(StorageBin).where(
                StorageBin.warehouse_id == warehouse_id,
                col(StorageBin.is_active).is_(True),
            )
        ).all()
    )
    candidates: list[SlotCandidate] = []
    seen: set[tuple[int, int, int, int]] = set()

    for sbin in bins:
        coords = (
            int(sbin.storage_row),
            int(sbin.storage_level),
            int(sbin.storage_cell_x),
            int(sbin.storage_cell_z or 1),
        )
        seen.add(coords)
        item = occupied.get(coords)
        candidates.append(
            SlotCandidate(
                storage_row=coords[0],
                storage_level=coords[1],
                storage_cell_x=coords[2],
                storage_cell_z=coords[3],
                storage_bin_id=str(sbin.id),
                current_qty=int(item.quantity) if item else 0,
                current_sku=item.sku if item else None,
                current_category_id=str(item.category_id)
                if item and item.category_id
                else None,
                capacity_qty=_bin_capacity(sbin, config.default_bin_capacity_qty)
                if item
                else 1,
                max_weight_kg=sbin.max_weight_kg,
            )
        )

    # Виртуальная сетка (как в receive_line), если bins пусты или мало свободных
    for r in range(1, MAX_ROW + 1):
        for lv in range(1, MAX_LEVEL + 1):
            for x in range(1, MAX_CELL_X + 1):
                coords = (r, lv, x, 1)
                if coords in seen:
                    continue
                item = occupied.get(coords)
                if item is None:
                    candidates.append(
                        SlotCandidate(
                            storage_row=r,
                            storage_level=lv,
                            storage_cell_x=x,
                            storage_cell_z=1,
                            current_qty=0,
                            capacity_qty=1,
                        )
                    )
                else:
                    # top-up только на существующем item той же ячейки
                    candidates.append(
                        SlotCandidate(
                            storage_row=r,
                            storage_level=lv,
                            storage_cell_x=x,
                            storage_cell_z=1,
                            current_qty=int(item.quantity or 0),
                            current_sku=item.sku,
                            current_category_id=str(item.category_id)
                            if item.category_id
                            else None,
                            capacity_qty=config.default_bin_capacity_qty,
                        )
                    )
    return candidates


def suggest_putaway_slot(
    session: Session,
    *,
    warehouse_id: UUID,
    sku: str | None,
    quantity: int = 1,
    category_id: UUID | None = None,
    weight_kg: float | None = None,
    abc_class: str | None = None,
    strategy: PutawayStrategyName | str | None = None,
    config: PutawayStrategyConfig | None = None,
) -> dict[str, Any] | None:
    """
    Подбирает ячейку. Возвращает dict для payload putaway / receive.
    При top-up добавляет ``top_up_item_id`` — увеличить quantity существующего Item.
    """
    cfg = config or PutawayStrategyConfig(
        name=parse_strategy_name(str(strategy) if strategy else None)
    )
    if strategy is not None:
        cfg = PutawayStrategyConfig(
            name=parse_strategy_name(str(strategy)),
            allow_sku_mix=cfg.allow_sku_mix,
            default_bin_capacity_qty=cfg.default_bin_capacity_qty,
            heavy_weight_kg=cfg.heavy_weight_kg,
            max_level_for_heavy=cfg.max_level_for_heavy,
            abc_period_days=cfg.abc_period_days,
        )

    abc_map = abc_class_by_sku(session, days=cfg.abc_period_days)
    cls = resolve_abc_class(sku=sku, abc_by_sku=abc_map, explicit=abc_class)
    candidates = _build_candidates(session, warehouse_id=warehouse_id, config=cfg)

    prefer_top_up = cfg.name == "top_up_then_abc"
    if cfg.name == "nearest_empty":
        # как «пустая ближайшая» — скорим как A, без top-up
        cls = "A"
        prefer_top_up = False
    elif cfg.name == "abc_nearest":
        prefer_top_up = False

    chosen = choose_best_slot(
        candidates,
        abc_class=cls,
        put_qty=max(1, quantity),
        put_sku=sku,
        put_category_id=str(category_id) if category_id else None,
        put_weight_kg=weight_kg,
        config=cfg,
        prefer_top_up=prefer_top_up,
    )
    if chosen is None:
        return None

    is_top_up = (
        prefer_top_up and chosen.current_qty > 0 and sku and chosen.current_sku == sku
    )
    reason = "top_up_same_sku" if is_top_up else f"abc_{cls.lower()}_slot"

    result: dict[str, Any] = {
        "slot_key": chosen.slot_key,
        "storage_row": chosen.storage_row,
        "storage_level": chosen.storage_level,
        "storage_cell_x": chosen.storage_cell_x,
        "storage_cell_z": chosen.storage_cell_z,
        "suggest_reason": reason,
        "abc_class": cls,
        "putaway_strategy": cfg.name,
        "capacity_qty": chosen.capacity_qty,
        "remaining_qty_before": chosen.remaining_qty,
    }
    if chosen.storage_bin_id:
        result["storage_bin_id"] = chosen.storage_bin_id

    if is_top_up:
        # найти item id в этой ячейке
        item = session.exec(
            select(Item).where(
                Item.status == "warehouse",
                Item.sku == sku,
                Item.storage_row == chosen.storage_row,
                Item.storage_level == chosen.storage_level,
                Item.storage_cell_x == chosen.storage_cell_x,
                Item.storage_cell_z == chosen.storage_cell_z,
            )
        ).first()
        if item is not None:
            result["top_up_item_id"] = str(item.id)

    return result


def slot_dict_to_public(slot: dict[str, Any] | None) -> dict[str, Any]:
    if not slot:
        return {}
    return {k: v for k, v in slot.items() if v is not None}
