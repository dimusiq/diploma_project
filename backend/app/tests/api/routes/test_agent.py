from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.core.config import settings


def test_agent_chat_requires_auth(client: TestClient) -> None:
    r = client.post(f"{settings.API_V1_STR}/agent/chat", json={"message": "Сколько товаров?"})
    assert r.status_code in (401, 403)


def test_agent_permissions_requires_auth(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/agent/permissions")
    assert r.status_code in (401, 403)


def test_agent_chat_logs_requires_auth(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/agent/chat/logs")
    assert r.status_code in (401, 403)


def test_agent_chat_logs_forbidden_for_viewer(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/agent/chat/logs",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 403


def test_agent_permissions_viewer_can_use(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/agent/permissions",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 200
    assert r.json()["can_use"] is True


def test_agent_chat_viewer_fallback_without_ollama(
    client: TestClient, normal_user_token_headers: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", None)
    r = client.post(
        f"{settings.API_V1_STR}/agent/chat",
        headers=normal_user_token_headers,
        json={"message": "Какой layout?"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ollama_available"] is False


def test_agent_permissions_superuser_can_use(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/agent/permissions",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    assert r.json()["can_use"] is True


def test_agent_chat_logs_superuser(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/agent/chat/logs",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "data" in data
    assert "count" in data


def test_agent_chat_fallback_without_ollama(
    client: TestClient, superuser_token_headers: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", None)
    r = client.post(
        f"{settings.API_V1_STR}/agent/chat",
        headers=superuser_token_headers,
        json={"message": "Какой layout?"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ollama_available"] is False
    assert data["model"] is None
    assert "Контекст" in data["reply"] or "layout" in data["reply"].lower()


def test_agent_chat_with_ollama_mock(
    client: TestClient, superuser_token_headers: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://ollama.test")
    monkeypatch.setattr(settings, "OLLAMA_MODEL", "test-model")

    async def fake_run(*_args, **_kwargs):
        return ("OK: ответ", True, "test-model")

    with patch(
        "app.api.routes.agent.run_agent_chat",
        new=AsyncMock(side_effect=fake_run),
    ):
        r = client.post(
            f"{settings.API_V1_STR}/agent/chat",
            headers=superuser_token_headers,
            json={"message": "Привет склад"},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["ollama_available"] is True
    assert data["model"] == "test-model"
    assert "OK:" in data["reply"] or "Привет" in data["reply"]
