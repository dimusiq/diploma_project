from app.agent.tool_orchestrator import plan_read_tools


def test_plan_intent_inventory() -> None:
    names = [n for n, _ in plan_read_tools("что на складе", {"intent": "inventory"})]
    assert names == ["get_inventory_summary"]


def test_plan_intent_equipment_with_maintenance_kw() -> None:
    names = [n for n, _ in plan_read_tools("просрочка ТО по парку", {"intent": "equipment"})]
    assert "get_equipment_status" in names
    assert "get_maintenance_calendar_events" in names


def test_plan_intent_equipment_no_maintenance_kw() -> None:
    names = [n for n, _ in plan_read_tools("сколько единиц техники", {"intent": "equipment"})]
    assert names == ["get_equipment_status"]


def test_plan_question_keywords_order() -> None:
    names = [n for n, _ in plan_read_tools("остатки и открытые задачи на складе", {"intent": "question"})]
    assert "get_inventory_summary" in names
    assert "get_open_tasks" in names
    assert names.index("get_inventory_summary") < names.index("get_open_tasks")


def test_plan_other_empty_when_no_match() -> None:
    names = [n for n, _ in plan_read_tools("расскажи анекдот", {"intent": "other"})]
    assert names == []
