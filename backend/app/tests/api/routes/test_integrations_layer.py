from fastapi.testclient import TestClient

from app.core.config import settings


def test_integration_layer_status_requires_auth(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/integrations/layer-status")
    assert r.status_code in (401, 403)


def test_integration_layer_status_ok(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/integrations/layer-status",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["version"] == "1"
    assert "message_bus" in data
    assert "domain_outbox" in data
    assert data["domain_outbox"]["transactional_outbox_table"] is True
    cons = data["domain_outbox"]["consumer_names"]
    assert "twin_timeline" in cons
    assert "slot_occupancy_sync" in cons
    assert data["integration_inbox"]["downstream_processing"] == "domain_pipeline_outbox_projections"
    ts = data["twin_state_layer"]
    assert ts["operational_db"]["engine"] == "postgresql"
    assert ts["event_store"]["primary_table"] == "domain_event"
    assert ts["projection_store"]["tables"]
    assert ts["time_series"]["dedicated_tsdb"] == "none"
    assert "pgvector" in ts["vector_store"]["engine"].lower()
    il = data["intelligence_layer"]
    assert "reasoning_llm" in il
    assert isinstance(il["reasoning_llm"]["llm_inference_configured"], bool)
    assert il["optimization_analytics"]["slotting_optimization"]["implementation"] == "none"
    og = data["observability_governance_layer"]
    assert og["policy_registry"]["status"] == "active"
    assert og["rbac_abac"]["status"] == "partial"
