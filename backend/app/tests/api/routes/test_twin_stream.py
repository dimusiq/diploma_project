from fastapi.testclient import TestClient

from app.core.config import settings


def test_twin_stream_requires_auth(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/twin/stream")
    assert r.status_code in (401, 403)


def test_twin_channels_list_ok(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/twin/channels",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert "occupancy" in data
    assert "item_movement" in data
    assert "telemetry" in data
