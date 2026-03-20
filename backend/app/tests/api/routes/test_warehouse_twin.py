from fastapi.testclient import TestClient

from app.core.config import settings


def test_twin_summary_requires_auth(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/warehouse/twin/summary")
    assert r.status_code in (401, 403)


def test_twin_summary_ok_for_superuser(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/warehouse/twin/summary",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "warehouse_items_total" in data
    assert "occupied_slots" in data
    assert "domain_events_by_type" in data
    assert isinstance(data["domain_events_by_type"], dict)


def test_twin_what_if_ok(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/warehouse/twin/what-if",
        headers=superuser_token_headers,
        json={"additional_items_by_row": {"1": 5}},
    )
    assert r.status_code == 200
    data = r.json()
    assert "projected_occupied_slots" in data
    assert data["projected_occupied_slots"] >= data["baseline_occupied_slots"]
