"""P0-4: пакет app.utils не конфликтует с модулем — импорт в любом порядке."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _run_import_script(script: str) -> None:
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    proc = subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(BACKEND_ROOT),
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )
    assert proc.returncode == 0, (
        f"exit={proc.returncode}\nstdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"
    )
    assert "ok" in proc.stdout


def test_import_utils_then_users_then_avatars() -> None:
    _run_import_script(
        "import app.utils; import app.api.routes.users; "
        "from app.utils import avatars; "
        "assert hasattr(avatars, 'process_avatar_image'); print('ok')"
    )


def test_import_users_then_utils_then_avatars() -> None:
    _run_import_script(
        "import app.api.routes.users; import app.utils; "
        "from app.utils import avatars; "
        "assert hasattr(avatars, 'process_avatar_image'); print('ok')"
    )


def test_import_app_main() -> None:
    _run_import_script("import app.main; print('ok')")


def test_utils_is_package_not_module_file() -> None:
    import app.utils as u

    assert u.__file__ is not None
    assert u.__file__.endswith("__init__.py")
    from app.utils import avatars, generate_password_reset_token, send_email

    assert callable(send_email)
    assert callable(generate_password_reset_token)
    assert hasattr(avatars, "avatar_file_path")
