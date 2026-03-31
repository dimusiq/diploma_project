import uuid
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.core.config import settings
from app.services.agent_chat import AgentChatOutcome


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


def test_agent_include_reasoning_debug_forbidden_for_viewer(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/agent/chat",
        headers=normal_user_token_headers,
        json={"message": "test", "include_reasoning_debug": True},
    )
    assert r.status_code == 403


def test_agent_chat_viewer_fallback_without_ollama(
    client: TestClient, normal_user_token_headers: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "VLLM_BASE_URL", None)
    monkeypatch.setattr(settings, "LLM_OPENAI_BASE_URL", None)
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", None)
    r = client.post(
        f"{settings.API_V1_STR}/agent/chat",
        headers=normal_user_token_headers,
        json={"message": "Какой layout?", "include_public_reasoning": True},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["llm_available"] is False
    assert "public_reasoning" in data
    assert "brief_explanation" in data["public_reasoning"]
    assert data.get("run_id")


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
    monkeypatch.setattr(settings, "VLLM_BASE_URL", None)
    monkeypatch.setattr(settings, "LLM_OPENAI_BASE_URL", None)
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", None)
    r = client.post(
        f"{settings.API_V1_STR}/agent/chat",
        headers=superuser_token_headers,
        json={"message": "Какой layout?", "include_public_reasoning": True},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["llm_available"] is False
    assert data.get("model") is None
    assert "Контекст" in data["reply"] or "layout" in data["reply"].lower()
    assert data.get("reasoning_debug") is None
    pr = data["public_reasoning"]
    assert pr is not None
    assert "data_sources" in pr


def test_agent_chat_with_ollama_mock(
    client: TestClient, superuser_token_headers: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "VLLM_BASE_URL", "http://vllm.test")
    monkeypatch.setattr(settings, "OLLAMA_MODEL", "test-model")

    async def fake_run(*_a, **_kw):
        return AgentChatOutcome(
            reply="OK: ответ",
            llm_available=True,
            model="test-model",
            public_reasoning={
                "brief_explanation": "Кратко",
                "tools_used": [],
                "data_sources": ["operational_state_warehouse_context"],
                "recommendation": "Итог",
                "models": {"main_loop": "test-model"},
                "main_loop_task": "chat",
            },
        )

    with patch(
        "app.api.routes.agent.run_agent_chat",
        new=AsyncMock(side_effect=fake_run),
    ):
        r = client.post(
            f"{settings.API_V1_STR}/agent/chat",
            headers=superuser_token_headers,
            json={"message": "Привет склад", "include_public_reasoning": True},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["llm_available"] is True
    assert data["model"] == "test-model"
    assert "OK:" in data["reply"] or "Привет" in data["reply"]
    assert data["public_reasoning"] is not None
    assert data["public_reasoning"]["main_loop_task"] == "chat"


def test_agent_chat_public_reasoning_omitted_by_default(
    client: TestClient, normal_user_token_headers: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "VLLM_BASE_URL", None)
    monkeypatch.setattr(settings, "LLM_OPENAI_BASE_URL", None)
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", None)
    r = client.post(
        f"{settings.API_V1_STR}/agent/chat",
        headers=normal_user_token_headers,
        json={"message": "Какой layout?"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("public_reasoning") is None


def test_agent_user_chats_requires_auth(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/agent/user-chats")
    assert r.status_code in (401, 403)


def test_agent_user_chats_crud(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    headers = normal_user_token_headers
    r = client.post(f"{settings.API_V1_STR}/agent/user-chats", headers=headers)
    assert r.status_code == 200
    cid = r.json()["id"]
    r2 = client.get(f"{settings.API_V1_STR}/agent/user-chats", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["count"] >= 1
    r3 = client.get(
        f"{settings.API_V1_STR}/agent/user-chats/{cid}",
        headers=headers,
    )
    assert r3.status_code == 200
    assert r3.json()["messages"] == []
    r4 = client.delete(
        f"{settings.API_V1_STR}/agent/user-chats/{cid}",
        headers=headers,
    )
    assert r4.status_code == 204


def test_agent_chat_user_chat_not_found(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    bad = str(uuid.uuid4())
    r = client.post(
        f"{settings.API_V1_STR}/agent/chat",
        headers=normal_user_token_headers,
        json={"message": "hi", "user_chat_id": bad},
    )
    assert r.status_code == 404


def test_agent_chat_persists_user_chat_messages(
    client: TestClient, normal_user_token_headers: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "VLLM_BASE_URL", None)
    monkeypatch.setattr(settings, "LLM_OPENAI_BASE_URL", None)
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", None)
    headers = normal_user_token_headers
    cr = client.post(f"{settings.API_V1_STR}/agent/user-chats", headers=headers)
    assert cr.status_code == 200
    cid = cr.json()["id"]
    r = client.post(
        f"{settings.API_V1_STR}/agent/chat",
        headers=headers,
        json={"message": "Какой layout?", "user_chat_id": cid},
    )
    assert r.status_code == 200
    d = client.get(
        f"{settings.API_V1_STR}/agent/user-chats/{cid}",
        headers=headers,
    )
    assert d.status_code == 200
    msgs = d.json()["messages"]
    assert len(msgs) == 2
    assert msgs[0]["role"] == "user"
    assert msgs[1]["role"] == "assistant"
