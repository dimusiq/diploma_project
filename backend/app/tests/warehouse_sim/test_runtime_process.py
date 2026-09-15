from pathlib import Path

from app.warehouse_sim.runtime import get_runtime


def test_get_runtime_is_process_singleton() -> None:
    assert get_runtime() is get_runtime()


def test_backend_dockerfile_uses_single_fastapi_worker() -> None:
    dockerfile = Path(__file__).resolve().parents[3] / "Dockerfile"
    text = dockerfile.read_text(encoding="utf-8")
    assert '"--workers", "1"' in text
    assert '"--workers", "4"' not in text
