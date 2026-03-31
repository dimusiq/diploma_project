from app.agent.tool_force_router import must_use_tool


def test_must_use_tool_triggers() -> None:
    assert must_use_tool("Сколько единиц техники?") is True
    assert must_use_tool("остатки по SKU-123") is True
    assert must_use_tool("как дела?") is False
