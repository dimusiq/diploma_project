from app.agent.policy import sanitize_agent_reply_visible_text


def test_sanitize_strips_zapusk_uuid_line() -> None:
    uid = "7b78da5f-3a76-4b7f-a4f3-7b390ce2b2d9"
    raw = f"Краткий ответ по складу.\n\nЗапуск: {uid}\n"
    assert sanitize_agent_reply_visible_text(raw) == "Краткий ответ по складу."


def test_sanitize_strips_run_uuid_line_english() -> None:
    uid = "550e8400-e29b-41d4-a716-446655440000"
    raw = f"Done.\nRun: {uid}"
    assert sanitize_agent_reply_visible_text(raw) == "Done."


def test_sanitize_preserves_normal_text() -> None:
    assert sanitize_agent_reply_visible_text("Запуск конвейера в 10:00.") == (
        "Запуск конвейера в 10:00."
    )


def test_sanitize_strips_meta_paragraph_with_get_and_tools() -> None:
    raw = (
        "В разделе складская техника указано 32. Нужно вызвать get_equipment_status.\n\n"
        "По учёту 32 единицы, 28 в эксплуатации."
    )
    out = sanitize_agent_reply_visible_text(raw)
    assert "get_equipment" not in out.lower()
    assert "32 единицы" in out


def test_sanitize_strips_double_get_paragraph() -> None:
    raw = (
        "Сначала get_equipment_status, потом get_maintenance_calendar_events.\n\n"
        "Итог: без просрочки."
    )
    out = sanitize_agent_reply_visible_text(raw)
    assert "get_" not in out.lower()
    assert "Итог" in out
