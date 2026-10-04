"""Контракт миграции индексов wsim_event (GIN payload + trigram)."""

from __future__ import annotations

from pathlib import Path


def test_wsim_event_gin_trgm_migration_defines_indexes() -> None:
    root = Path(__file__).resolve().parents[2]
    path = root / "alembic" / "versions" / "cc9d0e1f2a3b_wsim_event_gin_trgm_indexes.py"
    text = path.read_text(encoding="utf-8")
    assert 'revision = "cc9d0e1f2a3b"' in text
    assert 'down_revision = "bb8c9d0e1f2a"' in text
    assert "pg_trgm" in text
    assert "ix_wsim_event_payload_gin" in text
    assert "jsonb_path_ops" in text
    assert "ix_wsim_event_message_trgm" in text
    assert "gin_trgm_ops" in text
    assert "ix_wsim_event_event_type_trgm" in text
