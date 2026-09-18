from fastapi.testclient import TestClient

from app.core.config import settings


def test_kpi_snapshot_ok(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/warehouse/simulation/kpi-snapshot",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "twin_summary" in body
    assert "occupancy_by_zone" in body
    assert "simulation_only_kpis" in body
