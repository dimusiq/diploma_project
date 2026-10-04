"""Расширенная редакция PII / секретов для сообщений и логов."""

from __future__ import annotations

from app.agent.policy import redact_pii, redact_user_message


def test_redact_email_and_phone() -> None:
    raw = "Связь: ops@example.com, тел. +7 (999) 123-45-67"
    out = redact_pii(raw)
    assert "ops@example.com" not in out
    assert "[email]" in out
    assert "+7 (999) 123-45-67" not in out
    assert "[phone]" in out


def test_redact_inn_snils_passport() -> None:
    raw = "ИНН 7707083893, СНИЛС 112-233-445 95, паспорт 4510 123456"
    out = redact_pii(raw)
    assert "7707083893" not in out
    assert "[inn]" in out
    assert "112-233-445 95" not in out
    assert "[snils]" in out
    assert "4510 123456" not in out
    assert "[passport]" in out


def test_redact_card_luhn() -> None:
    # Тестовый номер Visa, проходит Luhn
    raw = "Карта 4111 1111 1111 1111 для возврата"
    out = redact_pii(raw)
    assert "4111" not in out
    assert "[card]" in out


def test_redact_tokens_bearer_jwt() -> None:
    jwt = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJzdWIiOiIxMjM0NTY3ODkwIn0."
        "signaturepart1234567890abcd"
    )
    raw = f"key sk-abcdef0123456789token Bearer abcdef0123456789.secret {jwt}"
    out = redact_pii(raw)
    assert "sk-abcdef" not in out
    assert "[secret_token]" in out
    assert "Bearer abcdef" not in out
    assert "[bearer_token]" in out
    assert "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" not in out
    assert "[jwt]" in out


def test_redact_user_message_strips_and_masks() -> None:
    out = redact_user_message("  ИНН 500100732259 и mail user@test.ru  ")
    assert "500100732259" not in out
    assert "user@test.ru" not in out
    assert "[inn]" in out
    assert "[email]" in out
