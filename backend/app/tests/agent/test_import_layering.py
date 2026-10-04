"""Нет import-time циклов agent ↔ services (изолированный subprocess)."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def test_agent_and_services_import_without_cycle() -> None:
    backend = Path(__file__).resolve().parents[2]
    script = """
import importlib
mods = [
    "app.agent.contracts",
    "app.agent.tool_safety",
    "app.agent.tool_force_router",
    "app.agent.tool_registry",
    "app.agent.memory",
    "app.agent.planner",
    "app.services.agent_tools",
    "app.services.agent_policy_engine",
    "app.services.agent_pending_actions",
    "app.services.agent_llm",
    "app.services.agent_chat",
]
for m in mods:
    importlib.import_module(m)
print("ok", len(mods))
"""
    env = os.environ.copy()
    env["PYTHONPATH"] = str(backend)
    # Минимальный набор для Settings в чистом процессе (без .env).
    env.setdefault("SECRET_KEY", "test-secret-key-for-import-check")
    env.setdefault("PROJECT_NAME", "nebardak-test")
    env.setdefault("POSTGRES_SERVER", "localhost")
    env.setdefault("POSTGRES_USER", "test")
    env.setdefault("POSTGRES_PASSWORD", "test")
    env.setdefault("FIRST_SUPERUSER", "test@example.com")
    env.setdefault("FIRST_SUPERUSER_PASSWORD", "testpass")
    proc = subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(backend),
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )
    assert proc.returncode == 0, proc.stderr or proc.stdout
    assert "ok" in proc.stdout
