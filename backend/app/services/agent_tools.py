"""Инструменты ассистента (read-only SQL под правами пользователя)."""

from __future__ import annotations

import json
from typing import Any

from sqlmodel import Session, col, select

from app.core.permissions import can_see_all_items
from app.models import Item, User


def _search_items(session: Session, user: User, args: dict[str, Any]) -> str:
    sku = str(args.get("sku_fragment") or "").strip()
    title = str(args.get("title_fragment") or "").strip()
    try:
        limit = int(args.get("limit") or 15)
    except (TypeError, ValueError):
        limit = 15
    limit = max(1, min(limit, 50))

    if not sku and not title:
        return json.dumps(
            {"error": "Укажите sku_fragment и/или title_fragment"},
            ensure_ascii=False,
        )

    stmt = select(Item)
    if not can_see_all_items(session, user):
        stmt = stmt.where(Item.owner_id == user.id)
    if sku:
        stmt = stmt.where(col(Item.sku).is_not(None)).where(col(Item.sku).ilike(f"%{sku}%"))
    if title:
        stmt = stmt.where(col(Item.title).ilike(f"%{title}%"))
    stmt = stmt.limit(limit)
    rows = list(session.exec(stmt).all())

    payload = [
        {
            "id": str(it.id),
            "title": it.title,
            "sku": it.sku,
            "status": it.status,
            "quantity": it.quantity,
            "row": it.storage_row,
            "level": it.storage_level,
            "cell_x": it.storage_cell_x,
            "cell_z": it.storage_cell_z,
        }
        for it in rows
    ]
    return json.dumps({"count": len(payload), "items": payload}, ensure_ascii=False)


TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_items_in_warehouse",
            "description": (
                "Поиск товаров на складе по фрагменту SKU или названия. "
                "Учитываются только товары, доступные пользователю по правам."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "sku_fragment": {
                        "type": "string",
                        "description": "Подстрока SKU (без учёта регистра)",
                    },
                    "title_fragment": {
                        "type": "string",
                        "description": "Подстрока названия товара",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Максимум записей (1–50), по умолчанию 15",
                    },
                },
            },
        },
    }
]


def run_agent_tool(
    session: Session,
    user: User,
    name: str,
    arguments: dict[str, Any],
) -> str:
    if name == "search_items_in_warehouse":
        return _search_items(session, user, arguments)
    return json.dumps({"error": f"Неизвестный инструмент: {name}"}, ensure_ascii=False)


def parse_tool_arguments(raw: str) -> dict[str, Any]:
    if not raw or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}
