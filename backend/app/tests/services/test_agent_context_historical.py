"""Срез domain events в контексте агента."""

from sqlmodel import Session, select

from app.core.config import settings
from app.models import User
from app.services.agent_context import build_historical_domain_events_block


def test_historical_block_none_without_audit_read(db: Session, monkeypatch) -> None:
    user = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
    assert user is not None
    monkeypatch.setattr(
        "app.services.agent_context.can_read_audit",
        lambda _session, _user: False,
    )
    text, meta = build_historical_domain_events_block(db, user)
    assert text is None
    assert meta["historical_domain_events"] is False


def test_historical_block_present_with_audit_read(db: Session, monkeypatch) -> None:
    user = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
    assert user is not None
    monkeypatch.setattr(
        "app.services.agent_context.can_read_audit",
        lambda _session, _user: True,
    )
    text, meta = build_historical_domain_events_block(db, user)
    assert meta["historical_domain_events"] is True
    assert meta["domain_events_24h_total"] is not None
    assert text is not None
    assert "24 ч" in text
