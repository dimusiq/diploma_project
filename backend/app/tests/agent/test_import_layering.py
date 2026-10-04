"""Нет import-time циклов agent ↔ services; порядок импорта не ломает слой."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def _run_import_script(script: str) -> subprocess.CompletedProcess[str]:
    backend = Path(__file__).resolve().parents[2]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(backend)
    env.setdefault("SECRET_KEY", "test-secret-key-for-import-check")
    env.setdefault("PROJECT_NAME", "nebardak-test")
    env.setdefault("POSTGRES_SERVER", "localhost")
    env.setdefault("POSTGRES_USER", "test")
    env.setdefault("POSTGRES_PASSWORD", "test")
    env.setdefault("FIRST_SUPERUSER", "test@example.com")
    env.setdefault("FIRST_SUPERUSER_PASSWORD", "testpass")
    return subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(backend),
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )


def test_agent_then_services_import_without_cycle() -> None:
    script = """
import importlib
order = [
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
for m in order:
    importlib.import_module(m)
print("ok", len(order))
"""
    proc = _run_import_script(script)
    assert proc.returncode == 0, proc.stderr or proc.stdout
    assert "ok 11" in proc.stdout


def test_services_then_agent_import_without_cycle() -> None:
    """Обратный порядок: цикл agent↔services проявился бы именно здесь."""
    script = """
import importlib
order = [
    "app.services.agent_chat",
    "app.services.agent_tools",
    "app.services.agent_policy_engine",
    "app.agent.tool_registry",
    "app.agent.contracts",
    "app.agent.structured_tool_loop",
]
for m in order:
    importlib.import_module(m)
print("ok", len(order))
"""
    proc = _run_import_script(script)
    assert proc.returncode == 0, proc.stderr or proc.stdout
    assert "ok 6" in proc.stdout


def test_utils_package_and_users_route_any_order() -> None:
    """Регресс P0-4: app.utils пакет vs файл не зависит от порядка импорта."""
    for script in (
        "import app.utils; import app.api.routes.users; print('ok')",
        "import app.api.routes.users; import app.utils; print('ok')",
    ):
        proc = _run_import_script(script)
        assert proc.returncode == 0, proc.stderr or proc.stdout
        assert "ok" in proc.stdout
