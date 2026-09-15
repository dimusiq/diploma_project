"""A* по сетке склада: стеллажи непроходимы, проезды — разрешённые клетки."""

from __future__ import annotations

import heapq
from typing import Iterable

from app.warehouse_sim.layout import (
    WAREHOUSE_DEPTH,
    WAREHOUSE_WIDTH,
    route_between,
)

GRID_M = 1.0
NEIGHBORS = ((1, 0), (-1, 0), (0, 1), (0, -1))


def _cell(x: float, z: float) -> tuple[int, int]:
    return int(round(x / GRID_M)), int(round(z / GRID_M))


def _world(ix: int, iz: int) -> dict[str, float]:
    return {"x": ix * GRID_M, "z": iz * GRID_M}


def blocked_cells(racks: Iterable[dict]) -> set[tuple[int, int]]:
    blocked: set[tuple[int, int]] = set()
    for rack in racks:
        x0 = rack["x"]
        z0 = rack["z"]
        x1 = x0 + rack["w"]
        z1 = z0 + rack["d"]
        ix0 = int(x0 / GRID_M)
        iz0 = int(z0 / GRID_M)
        ix1 = int(x1 / GRID_M) + 1
        iz1 = int(z1 / GRID_M) + 1
        for ix in range(ix0, ix1 + 1):
            for iz in range(iz0, iz1 + 1):
                blocked.add((ix, iz))
    return blocked


def astar_path(
    start: dict[str, float],
    goal: dict[str, float],
    racks: Iterable[dict],
    extra_blocked: set[tuple[int, int]] | None = None,
) -> list[dict[str, float]]:
    """
    Кратчайший путь по 4-связной сетке 1 м.
    Если цель внутри стеллажа — ищем ближайшую свободную клетку (точка подъезда).
    При неудаче — ортогональный маршрут по проездам.
    """
    blocked = blocked_cells(racks)
    if extra_blocked:
        blocked |= extra_blocked
    max_x = int(WAREHOUSE_WIDTH / GRID_M) + 8
    max_z = int(WAREHOUSE_DEPTH / GRID_M) + 8
    start_c = _cell(start["x"], start["z"])
    goal_c = _cell(goal["x"], goal["z"])

    def walkable(c: tuple[int, int]) -> bool:
        ix, iz = c
        if ix < -20 or iz < -8 or ix > max_x or iz > max_z:
            return False
        return c not in blocked

    if not walkable(goal_c):
        best = goal_c
        best_d = 10**9
        gx, gz = goal_c
        for dx in range(-6, 7):
            for dz in range(-6, 7):
                cand = (gx + dx, gz + dz)
                if walkable(cand):
                    d = abs(dx) + abs(dz)
                    if d < best_d:
                        best_d = d
                        best = cand
        goal_c = best

    if start_c == goal_c:
        return [dict(goal)]

    open_h: list[tuple[int, int, tuple[int, int]]] = []
    heapq.heappush(open_h, (0, 0, start_c))
    came: dict[tuple[int, int], tuple[int, int] | None] = {start_c: None}
    gscore = {start_c: 0}
    seq = 0

    while open_h:
        _f, _s, cur = heapq.heappop(open_h)
        if cur == goal_c:
            path: list[tuple[int, int]] = []
            node: tuple[int, int] | None = cur
            while node is not None:
                path.append(node)
                node = came[node]
            path.reverse()
            compact: list[dict[str, float]] = []
            for i, cell in enumerate(path):
                if i == 0:
                    continue
                compact.append(_world(*cell))
            if not compact:
                compact = [dict(goal)]
            else:
                compact[-1] = dict(goal)
            return compact
        cx, cz = cur
        for dx, dz in NEIGHBORS:
            nxt = (cx + dx, cz + dz)
            if not walkable(nxt) and nxt != goal_c:
                continue
            tentative = gscore[cur] + 1
            if tentative >= gscore.get(nxt, 10**9):
                continue
            came[nxt] = cur
            gscore[nxt] = tentative
            h = abs(nxt[0] - goal_c[0]) + abs(nxt[1] - goal_c[1])
            seq += 1
            heapq.heappush(open_h, (tentative + h, seq, nxt))

    return route_between(start, goal)


def path_blocked_by_device(
    next_point: dict[str, float],
    others: Iterable[dict],
    radius: float = 1.6,
) -> bool:
    nx, nz = next_point["x"], next_point["z"]
    for other in others:
        dx = other["x"] - nx
        dz = other["z"] - nz
        if dx * dx + dz * dz < radius * radius:
            return True
    return False
