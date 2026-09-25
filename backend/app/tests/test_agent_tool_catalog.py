"""Каталог инструментов агента и фильтрация по правам."""

from app.agent.tool_catalog import CATALOG_BY_NAME, tools_for_user
from app.agent.tool_safety import ToolSafetyClass


def test_catalog_contains_core_read_tools() -> None:
    for name in (
        "get_inventory_summary",
        "find_item_by_sku",
        "run_what_if_simulation",
        "get_layout_topology",
        "search_sop_documents",
    ):
        assert name in CATALOG_BY_NAME


def test_catalog_contains_act_and_admin_tools() -> None:
    assert "create_transfer_task" in CATALOG_BY_NAME
    assert CATALOG_BY_NAME["create_transfer_task"].safety == ToolSafetyClass.ACT
    assert "slot_key" in CATALOG_BY_NAME["create_transfer_task"].parameters
    assert "item_id" in CATALOG_BY_NAME["create_transfer_task"].parameters
    assert "publish_layout_version" in CATALOG_BY_NAME


def test_slotting_tools_are_read() -> None:
    names = {t.name for t in tools_for_user(is_superuser=False, has_audit_read=False)}
    for name in ("recommend_slotting", "compare_slotting_scenarios"):
        spec = CATALOG_BY_NAME[name]
        assert spec.safety == ToolSafetyClass.READ
        assert name in names
    assert CATALOG_BY_NAME["create_transfer_task"].safety == ToolSafetyClass.ACT


def test_get_recent_events_requires_audit_in_payload_filter() -> None:
    with_audit = {t.name for t in tools_for_user(is_superuser=False, has_audit_read=True)}
    without = {t.name for t in tools_for_user(is_superuser=False, has_audit_read=False)}
    assert "get_recent_events" in with_audit
    assert "get_recent_events" not in without


def test_admin_tools_only_for_superuser_payload() -> None:
    names_user = {t.name for t in tools_for_user(is_superuser=False, has_audit_read=True)}
    names_su = {t.name for t in tools_for_user(is_superuser=True, has_audit_read=True)}
    assert "reindex_knowledge" not in names_user
    assert "reindex_knowledge" in names_su


def test_get_maintenance_calendar_available_with_agent_use_only() -> None:
    """Календарь ТО для агента не отдельно от maintenance_schedule.view (только agent.use)."""
    with_m = {t.name for t in tools_for_user(is_superuser=False, has_audit_read=True)}
    without_m = {
        t.name
        for t in tools_for_user(
            is_superuser=False,
            has_audit_read=True,
            has_maintenance_schedule_view=False,
        )
    }
    assert "get_maintenance_calendar_events" in with_m
    assert "get_maintenance_calendar_events" in without_m


def test_enqueue_integration_requires_inbox_permission_in_payload_filter() -> None:
    with_inbox = {
        t.name
        for t in tools_for_user(
            is_superuser=False, has_audit_read=True, has_inbox_write=True
        )
    }
    without = {
        t.name
        for t in tools_for_user(
            is_superuser=False, has_audit_read=True, has_inbox_write=False
        )
    }
    assert "enqueue_integration_inbox" in with_inbox
    assert "enqueue_integration_inbox" not in without
