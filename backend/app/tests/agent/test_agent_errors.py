import httpx

from app.agent.agent_errors import chat_completion_400_implies_tools_unsupported


def test_400_tools_not_supported_openai_shape() -> None:
    r = httpx.Response(
        400,
        json={"error": {"message": "This model does not support tools", "type": "invalid_request_error"}},
    )
    assert chat_completion_400_implies_tools_unsupported(r) is True


def test_400_tool_choice_invalid() -> None:
    r = httpx.Response(
        400,
        text='{"error":{"message":"tool_choice: invalid value"}}',
    )
    assert chat_completion_400_implies_tools_unsupported(r) is True


def test_400_model_missing_no_tools_mention() -> None:
    r = httpx.Response(
        400,
        json={"error": {"message": "The model `foo` does not exist", "type": "invalid_request_error"}},
    )
    assert chat_completion_400_implies_tools_unsupported(r) is False


def test_400_empty_body() -> None:
    r = httpx.Response(400, text="")
    assert chat_completion_400_implies_tools_unsupported(r) is False
