from fastapi.testclient import TestClient

from app.core.config import settings


def test_notifications_stream_requires_auth(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/notifications/stream")
    assert r.status_code in (401, 403)
