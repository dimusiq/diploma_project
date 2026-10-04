"""Граничные значения limit для списка нарядов (не путать с /work-orders/events)."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.core.config import settings

LIST_URL = f"{settings.API_V1_STR}/work-orders"
EVENTS_URL = f"{settings.API_V1_STR}/work-orders/events"


def test_list_work_orders_limit_at_max(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(
        LIST_URL,
        headers=superuser_token_headers,
        params={"limit": 200},
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    assert "count" in body


def test_list_work_orders_limit_above_max_rejected(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(
        LIST_URL,
        headers=superuser_token_headers,
        params={"limit": 201},
    )
    assert r.status_code == 422


def test_list_work_order_events_limit_at_max(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    now = datetime.now(timezone.utc)
    r = client.get(
        EVENTS_URL,
        headers=superuser_token_headers,
        params={
            "from": (now - timedelta(days=7)).isoformat(),
            "to": now.isoformat(),
            "limit": 500,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    assert "count" in body


def test_list_work_order_events_limit_above_max_rejected(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    now = datetime.now(timezone.utc)
    r = client.get(
        EVENTS_URL,
        headers=superuser_token_headers,
        params={
            "from": (now - timedelta(days=7)).isoformat(),
            "to": now.isoformat(),
            "limit": 501,
        },
    )
    assert r.status_code == 422
