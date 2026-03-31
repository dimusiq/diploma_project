from app.agent.response_validation import (
    extract_answer_inner,
    validate_numbers_subset,
    validate_structured_reply,
)


def test_extract_answer_inner() -> None:
    assert extract_answer_inner("x<answer>  hello  </answer>") == "hello"


def test_validate_numbers_subset() -> None:
    assert validate_numbers_subset("32 шт", '{"total_units": 32}') is True
    assert validate_numbers_subset("32 шт", '{"total_units": 320}') is False


def test_validate_structured_reply_plain_text_accepted() -> None:
    ok, p = validate_structured_reply("Ответ без тегов.", "ctx")
    assert ok is True and p == "Ответ без тегов."


def test_validate_structured_reply_empty_is_format_error() -> None:
    ok, p = validate_structured_reply("   \n", "ctx")
    assert ok is False and p == "format"
