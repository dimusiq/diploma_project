"""Maintenance calendar events for draggable planning UI.

Эти события не содержат реального start/end по времени выполнения:
они представляют "следующее ТО" (по моточасам) и используются в календаре
как карточки, которые пользователь перетаскивает на конкретный тайм-слот.
"""

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import CurrentUser, SessionDep
from app.core.permissions import can_view_maintenance_schedule
from app.models import MaintenanceCalendarEventList
from app.services.maintenance_calendar_query import build_maintenance_calendar_event_list

router = APIRouter(prefix="/maintenance-calendar-events", tags=["maintenance-calendar-events"])


@router.get("", response_model=MaintenanceCalendarEventList)
def list_maintenance_calendar_events(
    session: SessionDep,
    current_user: CurrentUser,
    status: str | None = Query(None, description="Фильтр: overdue | due_soon | ok"),
    limit: int = Query(100, ge=1, le=500),
) -> MaintenanceCalendarEventList:
    if status is not None and status not in {"overdue", "due_soon", "ok"}:
        raise HTTPException(status_code=400, detail="Недопустимый статус")
    if not can_view_maintenance_schedule(session, current_user):
        raise HTTPException(status_code=403, detail="Недостаточно прав для просмотра")

    return build_maintenance_calendar_event_list(session, status=status, limit=limit)
