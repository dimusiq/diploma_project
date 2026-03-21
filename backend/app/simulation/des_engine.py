"""
Дискретно-событийная модель: доки → putaway (погрузчики), отбор (оператор + погрузчик),
пополнение (погрузчик). Время в минутах.
"""

from __future__ import annotations

import heapq
import math
import random
from collections import deque
from dataclasses import dataclass, field
from typing import Literal

PutawayRule = Literal["nearest", "round_robin", "random"]


def _putaway_factor(rule: PutawayRule, rng: random.Random) -> float:
    if rule == "nearest":
        return rng.lognormvariate(0, 0.25)
    if rule == "round_robin":
        return rng.lognormvariate(0.12, 0.28)
    return rng.lognormvariate(0.22, 0.35)


@dataclass
class SimulationConfig:
    duration_hours: float = 48.0
    seed: int = 42
    dock_bays: int = 2
    num_forklifts: int = 3
    num_operators: int = 5
    truck_arrival_rate_per_hour: float = 3.5
    mean_dock_service_min: float = 22.0
    pick_orders_per_hour: float = 95.0
    mean_pick_duration_min: float = 4.5
    mean_putaway_duration_min: float = 11.0
    replenishment_trips_per_hour: float = 8.0
    mean_replenishment_min: float = 18.0
    putaway_rule: PutawayRule = "nearest"
    layout_travel_scale: float = 1.0
    sandbox_extra_putaway_min: float = 0.0


@dataclass
class SimulationKpis:
    max_dock_queue: int = 0
    max_putaway_queue: int = 0
    max_pick_queue: int = 0
    mean_dock_turnaround_min: float | None = None
    mean_inbound_dwell_min: float | None = None
    mean_pick_wait_min: float | None = None
    mean_pick_path_proxy_min: float | None = None
    mean_replenishment_cycle_min: float | None = None
    forklift_utilization: float = 0.0
    operator_utilization: float = 0.0
    dock_utilization: float = 0.0
    otif_proxy: float = 0.0
    late_pick_fraction: float = 0.0
    events_processed: int = 0


@dataclass
class SimulationResult:
    kpis: SimulationKpis
    horizon_minutes: float
    event_trace_tail: list[dict] = field(default_factory=list)


@dataclass
class _Acc:
    max_dock_q: int = 0
    max_put_q: int = 0
    max_pick_q: int = 0
    dock_service_min: float = 0.0
    fk_busy_min: float = 0.0
    op_busy_min: float = 0.0
    dock_turnarounds: list[float] = field(default_factory=list)
    dwell_times: list[float] = field(default_factory=list)
    pick_waits: list[float] = field(default_factory=list)
    pick_durations: list[float] = field(default_factory=list)
    repl_cycles: list[float] = field(default_factory=list)
    late_picks: int = 0
    total_picks: int = 0
    events: int = 0


def run_discrete_event_simulation(cfg: SimulationConfig) -> SimulationResult:
    rng = random.Random(cfg.seed)
    horizon = max(1.0, cfg.duration_hours * 60.0)
    acc = _Acc()

    bays = max(1, cfg.dock_bays)
    nf = max(1, cfg.num_forklifts)
    no = max(1, cfg.num_operators)

    dock_next = [0.0] * bays
    fk_next = [0.0] * nf
    op_next = [0.0] * no

    dock_queue: deque[float] = deque()
    putaway_queue: deque[tuple[float, int]] = deque()
    pick_queue: deque[tuple[float, int]] = deque()

    seq = 0
    heap: list[tuple[float, int, str, dict]] = []
    trace: list[dict] = []

    pallet_id = 0
    pick_id = 0
    sla_wait_threshold_min = 25.0

    def push(when: float, kind: str, **payload: object) -> None:
        nonlocal seq
        if when > horizon + 1e9:
            return
        seq += 1
        heapq.heappush(heap, (when, seq, kind, payload))

    def next_exp(rate_per_hour: float) -> float:
        if rate_per_hour <= 0:
            return horizon + 999
        return rng.expovariate(rate_per_hour / 60.0)

    def try_dock(_t: float) -> None:
        nonlocal pallet_id
        while dock_queue:
            bi = min(range(bays), key=lambda i: dock_next[i])
            arrival = dock_queue[0]
            start = max(arrival, dock_next[bi])
            if start > horizon:
                break
            dock_queue.popleft()
            sigma = 0.35
            mu = math.log(max(0.5, cfg.mean_dock_service_min)) - 0.5 * sigma**2
            dur = max(0.5, rng.lognormvariate(mu, sigma))
            end = start + dur
            dock_next[bi] = end
            acc.dock_service_min += dur
            acc.dock_turnarounds.append(end - arrival)
            push(end, "dock_done", bay=bi, pallet_arrival=arrival, pallet_id=pallet_id)
            pallet_id += 1

    def try_putaway(_t: float) -> None:
        while putaway_queue:
            fi = min(range(nf), key=lambda i: fk_next[i])
            arrival, pid = putaway_queue[0]
            start = max(arrival, fk_next[fi])
            if start > horizon:
                break
            putaway_queue.popleft()
            base = cfg.mean_putaway_duration_min * _putaway_factor(cfg.putaway_rule, rng)
            dur = max(0.5, base * cfg.layout_travel_scale) + cfg.sandbox_extra_putaway_min
            end = start + dur
            fk_next[fi] = end
            acc.fk_busy_min += dur
            acc.dwell_times.append(end - arrival)
            push(end, "putaway_done", fk=fi, pid=pid)

    def try_pick(_t: float) -> None:
        while pick_queue:
            fi = min(range(nf), key=lambda i: fk_next[i])
            oi = min(range(no), key=lambda i: op_next[i])
            arrival, pid = pick_queue[0]
            start = max(arrival, fk_next[fi], op_next[oi])
            if start > horizon:
                break
            pick_queue.popleft()
            sigma = 0.3
            mu = math.log(max(0.4, cfg.mean_pick_duration_min * cfg.layout_travel_scale))
            mu += math.log(max(0.25, cfg.layout_travel_scale)) * 0.15
            dur = max(0.3, rng.lognormvariate(mu, sigma))
            end = start + dur
            fk_next[fi] = end
            op_next[oi] = end
            acc.fk_busy_min += dur
            acc.op_busy_min += dur
            wait = start - arrival
            acc.pick_waits.append(wait)
            acc.pick_durations.append(dur)
            acc.total_picks += 1
            if wait > sla_wait_threshold_min:
                acc.late_picks += 1
            push(end, "pick_done", fk=fi, op=oi, pid=pid)

    push(next_exp(cfg.truck_arrival_rate_per_hour), "truck_arrive")
    push(next_exp(cfg.pick_orders_per_hour), "pick_arrive")
    if cfg.replenishment_trips_per_hour > 0:
        push(next_exp(cfg.replenishment_trips_per_hour), "replen_arrive")

    while heap:
        t, _, kind, pl = heapq.heappop(heap)
        if t > horizon:
            break
        acc.events += 1
        if len(trace) < 100:
            trace.append({"t_min": round(t, 2), "kind": kind})

        if kind == "truck_arrive":
            dock_queue.append(t)
            acc.max_dock_q = max(acc.max_dock_q, len(dock_queue))
            try_dock(t)
            push(t + next_exp(cfg.truck_arrival_rate_per_hour), "truck_arrive")

        elif kind == "dock_done":
            putaway_queue.append((t, int(pl.get("pallet_id", 0))))
            acc.max_put_q = max(acc.max_put_q, len(putaway_queue))
            try_putaway(t)
            try_dock(t)

        elif kind == "putaway_done":
            try_putaway(t)

        elif kind == "pick_arrive":
            pick_queue.append((t, pick_id))
            pick_id += 1
            acc.max_pick_q = max(acc.max_pick_q, len(pick_queue))
            try_pick(t)
            push(t + next_exp(cfg.pick_orders_per_hour), "pick_arrive")

        elif kind == "pick_done":
            try_pick(t)

        elif kind == "replen_arrive":
            fi = min(range(nf), key=lambda i: fk_next[i])
            start = max(t, fk_next[fi])
            if start > horizon:
                push(t + next_exp(cfg.replenishment_trips_per_hour), "replen_arrive")
                continue
            sigma = 0.35
            mu = math.log(max(0.5, cfg.mean_replenishment_min * cfg.layout_travel_scale))
            dur = max(1.0, rng.lognormvariate(mu, sigma))
            end = start + dur
            fk_next[fi] = end
            acc.fk_busy_min += dur
            acc.repl_cycles.append(dur)
            push(end, "replen_done")
            push(t + next_exp(cfg.replenishment_trips_per_hour), "replen_arrive")

        elif kind == "replen_done":
            pass

    def mean(xs: list[float]) -> float | None:
        return round(sum(xs) / len(xs), 3) if xs else None

    dock_cap = bays * horizon
    fk_cap = nf * horizon
    op_cap = no * horizon

    kpis = SimulationKpis(
        max_dock_queue=acc.max_dock_q,
        max_putaway_queue=acc.max_put_q,
        max_pick_queue=acc.max_pick_q,
        mean_dock_turnaround_min=mean(acc.dock_turnarounds),
        mean_inbound_dwell_min=mean(acc.dwell_times),
        mean_pick_wait_min=mean(acc.pick_waits),
        mean_pick_path_proxy_min=mean(acc.pick_durations),
        mean_replenishment_cycle_min=mean(acc.repl_cycles),
        forklift_utilization=round(min(1.0, acc.fk_busy_min / fk_cap), 4) if fk_cap else 0.0,
        operator_utilization=round(min(1.0, acc.op_busy_min / op_cap), 4) if op_cap else 0.0,
        dock_utilization=round(min(1.0, acc.dock_service_min / dock_cap), 4) if dock_cap else 0.0,
        otif_proxy=round(
            max(0.0, min(1.0, 1.0 - acc.late_picks / acc.total_picks)),
            4,
        )
        if acc.total_picks
        else 1.0,
        late_pick_fraction=round(acc.late_picks / acc.total_picks, 4) if acc.total_picks else 0.0,
        events_processed=acc.events,
    )
    return SimulationResult(
        kpis=kpis,
        horizon_minutes=horizon,
        event_trace_tail=trace[-40:],
    )
