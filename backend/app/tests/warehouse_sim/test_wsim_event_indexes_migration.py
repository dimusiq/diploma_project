"""Контракт миграции индексов wsim_event: upgrade() реально создаёт GIN/trgm."""

from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path
from types import ModuleType
from unittest.mock import MagicMock

from sqlalchemy import text
from sqlmodel import Session


def _load_migration() -> tuple[ModuleType, list[str]]:
    root = Path(__file__).resolve().parents[2]
    path = root / "alembic" / "versions" / "cc9d0e1f2a3b_wsim_event_gin_trgm_indexes.py"
    assert path.is_file(), f"нет файла миграции: {path}"

    calls: list[str] = []
    fake_op = MagicMock()

    def _execute(sql: object) -> None:
        calls.append(str(sql))

    fake_op.execute.side_effect = _execute
    fake_alembic = types.ModuleType("alembic")
    fake_alembic.__dict__["op"] = fake_op
    prev = sys.modules.get("alembic")
    sys.modules["alembic"] = fake_alembic
    try:
        spec = importlib.util.spec_from_file_location(
            "wsim_event_gin_trgm_migration", path
        )
        assert spec is not None and spec.loader is not None
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    finally:
        if prev is None:
            sys.modules.pop("alembic", None)
        else:
            sys.modules["alembic"] = prev
    return mod, calls


def test_upgrade_emits_gin_and_trgm_index_ddl() -> None:
    """Удаление CREATE INDEX из upgrade() ломает этот тест (не substring-поиск)."""
    mod, calls = _load_migration()
    assert mod.revision == "cc9d0e1f2a3b"
    assert mod.down_revision == "bb8c9d0e1f2a"

    calls.clear()
    mod.upgrade()
    blob = "\n".join(calls).lower()
    assert "create extension" in blob and "pg_trgm" in blob
    assert "ix_wsim_event_payload_gin" in blob
    assert "jsonb_path_ops" in blob
    assert "ix_wsim_event_message_trgm" in blob
    assert "gin_trgm_ops" in blob
    assert "ix_wsim_event_event_type_trgm" in blob
    assert blob.count("create index") >= 3

    calls.clear()
    mod.downgrade()
    down = "\n".join(calls).lower()
    assert "drop index" in down
    assert "ix_wsim_event_payload_gin" in down


def test_wsim_event_indexes_present_in_database(db: Session) -> None:
    """Интеграция: после prestart индексы реально есть в PostgreSQL."""
    rows = db.execute(
        text(
            "SELECT indexname FROM pg_indexes "
            "WHERE tablename = 'wsim_event' AND schemaname = 'public'"
        )
    ).all()
    names = {str(r[0]) for r in rows}
    assert "ix_wsim_event_payload_gin" in names
    assert "ix_wsim_event_message_trgm" in names
    assert "ix_wsim_event_event_type_trgm" in names
