"""Чтение feature flags из БД (простая проверка для серверного кода)."""

from __future__ import annotations

from sqlmodel import Session, select

from app.models import FeatureFlag


def is_feature_enabled(session: Session, key: str) -> bool:
    row = session.exec(select(FeatureFlag).where(FeatureFlag.key == key)).first()
    return bool(row and row.enabled)


def all_flags_map(session: Session) -> dict[str, bool]:
    rows = list(session.exec(select(FeatureFlag)).all())
    return {r.key: bool(r.enabled) for r in rows}
