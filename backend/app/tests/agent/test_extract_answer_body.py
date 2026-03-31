from app.agent.policy import extract_answer_body, sanitize_agent_reply_visible_text


def test_extract_answer_body_uses_last_answer_block() -> None:
    raw = "шум<answer>первый</answer>ещё<answer>итоговый</answer>"
    assert extract_answer_body(raw) == "итоговый"


def test_extract_answer_body_closing_tag_without_opening() -> None:
    raw = (
        "Первым делом смотрю контекст.\n\n"
        "В системе нет данных.\n"
        "</answer>"
    )
    assert extract_answer_body(raw) == "В системе нет данных."


def test_sanitize_strips_cot_before_answer() -> None:
    raw = (
        "Первым делом обращаюсь к разделу о технике.\n\n"
        "<answer>\nКратко: нет данных.\n</answer>"
    )
    out = sanitize_agent_reply_visible_text(raw)
    assert "Первым делом" not in out
    assert "нет данных" in out
