"""Аудит критичных операций администраторов."""

import json
import uuid
from typing import Any

from sqlmodel import Session

from app.models import AuditLog


def get_client_ip(request: Any) -> str:
    """IP клиента из запроса (учёт x-forwarded-for)."""
    if request is None:
        return "unknown"
    forwarded = getattr(request, "headers", None) and request.headers.get(
        "x-forwarded-for"
    )
    if forwarded:
        return forwarded.split(",")[0].strip()
    if getattr(request, "client", None) and request.client:
        return request.client.host or "unknown"
    return "unknown"


def log_audit(
    session: Session,
    *,
    user_id: uuid.UUID,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID | None = None,
    details: dict | str | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Записать запись в журнал аудита."""
    details_str: str | None = None
    if details is not None:
        details_str = json.dumps(details, ensure_ascii=False) if isinstance(details, dict) else str(details)
        if len(details_str) > 4096:
            details_str = details_str[:4092] + "..."
    entry = AuditLog(
        user_id=user_id,
        action=action[:128],
        resource_type=resource_type[:64],
        resource_id=resource_id,
        details=details_str,
        ip_address=ip_address[:64] if ip_address else None,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry
