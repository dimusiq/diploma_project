from app.agent.answer_guardrails import (
    GUARDRAIL_FALLBACK_REPLY,
    apply_numeric_grounding_guardrail,
    collect_grounding_text,
    numbers_grounded_in_text,
)


def test_numbers_grounded_when_absent() -> None:
    assert numbers_grounded_in_text("В системе нет данных", "anything") is True


def test_numbers_grounded_when_match_json() -> None:
    g = '{"total_units": 32, "listed_units": 10}'
    assert numbers_grounded_in_text("На учёте 32 единицы.", g) is True


def test_numbers_not_grounded_hallucination() -> None:
    g = '{"total_units": 320}'
    assert numbers_grounded_in_text("Итого 32 единицы.", g) is False


def test_apply_guardrail_replaces() -> None:
    messages = [{"role": "user", "content": "Контекст: пусто"}]
    out = apply_numeric_grounding_guardrail("<answer>45 штук</answer>", messages)
    assert out == GUARDRAIL_FALLBACK_REPLY


def test_collect_grounding_joins_user_and_tool() -> None:
    messages = [
        {"role": "system", "content": "x"},
        {"role": "user", "content": "ctx"},
        {"role": "tool", "content": '{"n": 7}'},
    ]
    g = collect_grounding_text(messages)
    assert "ctx" in g and '"n": 7' in g and "system" not in g
