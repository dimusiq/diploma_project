"""API актов инвентаризации (count → факт → проведение)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    InventoryCountAct,
    InventoryCountActList,
    InventoryCountActPublic,
    InventoryCountCreate,
    InventoryCountFactsRequest,
    InventoryCountPostRequest,
)
from app.services.inventory_counting import (
    act_to_public,
    create_count,
    enter_facts,
    list_acts,
    load_lines,
    post_act,
)

router = APIRouter(prefix="/inventory-counts", tags=["inventory-counts"])


def _to_public(
    data: dict[str, Any] | InventoryCountAct,
    lines: list[Any] | None = None,
    *,
    idempotent: bool = False,
) -> InventoryCountActPublic:
    if isinstance(data, dict):
        return InventoryCountActPublic.model_validate(data)
    assert lines is not None
    return InventoryCountActPublic.model_validate(
        act_to_public(data, lines, idempotent=idempotent)
    )


@router.get("/", response_model=InventoryCountActList)
def list_inventory_counts(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    status: str | None = None,
) -> Any:
    rows, count = list_acts(session, skip=skip, limit=limit, status=status)
    data = [
        _to_public(act, load_lines(session, act.id)) for act in rows
    ]
    return InventoryCountActList(data=data, count=count)


@router.get("/{act_id}", response_model=InventoryCountActPublic)
def get_inventory_count(
    session: SessionDep,
    _current_user: CurrentUser,
    act_id: uuid.UUID,
) -> Any:
    act = session.get(InventoryCountAct, act_id)
    if not act:
        raise HTTPException(status_code=404, detail="Акт инвентаризации не найден")
    return _to_public(act, load_lines(session, act.id))


@router.post("/", response_model=InventoryCountActPublic)
def create_inventory_count(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    body: InventoryCountCreate,
) -> Any:
    try:
        act = create_count(
            session,
            warehouse_id=body.warehouse_id,
            mode=body.mode,
            reason=body.reason,
            line_inputs=[ln.model_dump() for ln in body.lines],
            actor_user_id=current_user.id,
        )
        session.commit()
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise
    session.refresh(act)
    return _to_public(act, load_lines(session, act.id))


@router.post("/{act_id}/facts", response_model=InventoryCountActPublic)
def set_inventory_count_facts(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    act_id: uuid.UUID,
    body: InventoryCountFactsRequest,
) -> Any:
    act = session.get(InventoryCountAct, act_id)
    if not act:
        raise HTTPException(status_code=404, detail="Акт инвентаризации не найден")
    try:
        lines = enter_facts(
            session,
            act,
            facts=[
                {
                    "item_id": ln.item_id,
                    "counted_quantity": ln.counted_quantity,
                }
                for ln in body.lines
            ],
        )
        session.commit()
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise
    session.refresh(act)
    return _to_public(act, lines)


@router.post("/{act_id}/post", response_model=InventoryCountActPublic)
def post_inventory_count(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    act_id: uuid.UUID,
    body: InventoryCountPostRequest | None = None,
) -> Any:
    act = session.get(InventoryCountAct, act_id)
    if not act:
        raise HTTPException(status_code=404, detail="Акт инвентаризации не найден")
    try:
        act, lines, idempotent = post_act(
            session,
            act,
            actor_user_id=current_user.id,
            reason=body.reason if body else None,
        )
        session.commit()
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise
    session.refresh(act)
    return _to_public(act, lines, idempotent=idempotent)
