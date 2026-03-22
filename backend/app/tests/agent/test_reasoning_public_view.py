from app.agent.reasoning_runtime import (
    StructuredReasoningRun,
    build_public_reasoning_view,
)


def test_public_reasoning_includes_operational_cycle_and_run_log() -> None:
    run = StructuredReasoningRun(
        run_id="550e8400-e29b-41d4-a716-446655440000",
        memory_meta={
            "warehouse_context": True,
            "twin_queue_projections": True,
        },
        llm_rounds=2,
        tool_calls=[{"name": "get_inventory_summary", "args_preview": "{}"}],
        verify_rounds=[[{"tool": "get_inventory_summary", "ok": True}]],
    )
    out = build_public_reasoning_view(
        final_reply="Кратко.\n\nДетали.\n\nИтог.",
        run=run,
    )
    assert out["next_steps"] == "Детали."
    assert out["confidence"] == "средняя"
    assert out["operational_cycle"]["act"] == "инструментов: 1"
    assert out["run_log_ref"] is not None
    assert "550e8400" in out["run_log_ref"]
    assert "twin_queue_depth_projections" in out["data_sources"]
