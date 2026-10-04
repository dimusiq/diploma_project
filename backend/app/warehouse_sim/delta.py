"""
Дельты снапшотов motion/data для SSE warehouse-sim.

Полный снапшот: mode=full (обратная совместимость).
Дельта: mode=delta, patch с upsert/remove по id; клиент merge'ит в локальное состояние.
"""

from __future__ import annotations

import json
from typing import Any

# Скалярные/целиком заменяемые поля motion
_MOTION_SCALARS = ("timeSec", "running", "version")
_MOTION_LISTS = ("devices", "workers", "trucks", "rackFill")
_MOTION_DICTS = ("zonePallets",)

_DATA_SCALARS = (
    "timeSec",
    "dayStartSec",
    "realTime",
    "state",
    "running",
    "speed",
    "scenario",
    "version",
    "cellsTotal",
    "cellsOccupied",
    "palletsTotal",
)
_DATA_REPLACE = (
    "config",
    "topology",
    "metrics",
    "kpi",
    "skuLabels",
    "eventCounts",
    "occupiedCellIds",
)
_DATA_LISTS = (
    ("devices", "id"),
    ("trucks", "id"),
    ("inbound", "id"),
    ("outbound", "id"),
    ("tasks", "id"),
    ("workers", "id"),
    ("events", "id"),
)


def _id_key_for_motion_list(name: str) -> str:
    if name == "rackFill":
        return "rackId"
    return "id"


def _entity_map(
    rows: list[dict[str, Any]] | None, id_key: str
) -> dict[Any, dict[str, Any]]:
    out: dict[Any, dict[str, Any]] = {}
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        kid = row.get(id_key)
        if kid is None:
            continue
        out[kid] = row
    return out


def _list_patch(
    prev_rows: list[dict[str, Any]] | None,
    curr_rows: list[dict[str, Any]] | None,
    id_key: str,
) -> dict[str, Any] | None:
    prev = _entity_map(prev_rows, id_key)
    curr = _entity_map(curr_rows, id_key)
    upsert: list[dict[str, Any]] = []
    for kid, row in curr.items():
        old = prev.get(kid)
        if old != row:
            upsert.append(row)
    remove = [kid for kid in prev if kid not in curr]
    if not upsert and not remove:
        return None
    patch: dict[str, Any] = {}
    if upsert:
        patch["upsert"] = upsert
    if remove:
        patch["remove"] = remove
    return patch


def diff_motion(
    prev: dict[str, Any] | None, curr: dict[str, Any]
) -> dict[str, Any] | None:
    """Патч motion относительно prev; None если изменений нет."""
    if not prev:
        return None
    patch: dict[str, Any] = {}
    for key in _MOTION_SCALARS:
        if prev.get(key) != curr.get(key):
            patch[key] = curr.get(key)
    for name in _MOTION_LISTS:
        lp = _list_patch(prev.get(name), curr.get(name), _id_key_for_motion_list(name))
        if lp is not None:
            patch[name] = lp
    for name in _MOTION_DICTS:
        if prev.get(name) != curr.get(name):
            patch[name] = curr.get(name)
    return patch or None


def diff_data(
    prev: dict[str, Any] | None, curr: dict[str, Any]
) -> dict[str, Any] | None:
    if not prev:
        return None
    patch: dict[str, Any] = {}
    for key in _DATA_SCALARS:
        if prev.get(key) != curr.get(key):
            patch[key] = curr.get(key)
    for key in _DATA_REPLACE:
        if prev.get(key) != curr.get(key):
            patch[key] = curr.get(key)
    for name, id_key in _DATA_LISTS:
        lp = _list_patch(prev.get(name), curr.get(name), id_key)
        if lp is not None:
            patch[name] = lp
    return patch or None


def apply_list_patch(
    prev_rows: list[dict[str, Any]] | None,
    patch: dict[str, Any] | None,
    id_key: str,
) -> list[dict[str, Any]]:
    """Применяет upsert/remove, сохраняя порядок (обновления на месте, новые в конец)."""
    rows = list(prev_rows or [])
    if not patch:
        return rows
    remove = set(patch.get("remove") or [])
    if remove:
        rows = [r for r in rows if r.get(id_key) not in remove]
    upserts = patch.get("upsert") or []
    if not upserts:
        return rows
    index = {r.get(id_key): i for i, r in enumerate(rows)}
    for row in upserts:
        kid = row.get(id_key)
        if kid in index:
            rows[index[kid]] = row
        else:
            index[kid] = len(rows)
            rows.append(row)
    return rows


def apply_motion_delta(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for key in _MOTION_SCALARS:
        if key in patch:
            out[key] = patch[key]
    for name in _MOTION_LISTS:
        if name in patch:
            out[name] = apply_list_patch(
                out.get(name), patch[name], _id_key_for_motion_list(name)
            )
    for name in _MOTION_DICTS:
        if name in patch:
            out[name] = patch[name]
    return out


def apply_data_delta(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for key in _DATA_SCALARS:
        if key in patch:
            out[key] = patch[key]
    for key in _DATA_REPLACE:
        if key in patch:
            out[key] = patch[key]
    for name, id_key in _DATA_LISTS:
        if name in patch:
            out[name] = apply_list_patch(out.get(name), patch[name], id_key)
    return out


def envelope(
    kind: str,
    *,
    revision: int,
    mode: str,
    payload: dict[str, Any],
    base_revision: int | None = None,
) -> dict[str, Any]:
    msg: dict[str, Any] = {
        "v": 1,
        "type": kind,
        "mode": mode,
        "revision": revision,
        "payload": payload,
    }
    if base_revision is not None:
        msg["base_revision"] = base_revision
    return msg


def should_send_full(
    delta_payload: dict[str, Any], full_payload: dict[str, Any]
) -> bool:
    """Если дельта почти полного размера — дешевле отдать full."""
    try:
        dsz = len(json.dumps(delta_payload, ensure_ascii=False, default=str))
        fsz = len(json.dumps(full_payload, ensure_ascii=False, default=str))
    except (TypeError, ValueError):
        return True
    if fsz <= 0:
        return True
    return dsz >= int(fsz * 0.7)
