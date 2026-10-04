"""Расширенная редакция PII / секретов для сообщений и аудита."""

from __future__ import annotations

import pytest

from app.agent.policy import (
    redact_audit,
    redact_pii,
    redact_user_message,
    sanitize_for_log,
)

# Валидные контрольные номера (не маскировать как «случайные» id).
_VALID_INN_10 = "7707083893"
_VALID_INN_12 = "500100732259"
_VALID_SNILS = "112-233-445 95"
_VALID_CARD = "4111 1111 1111 1111"


@pytest.mark.parametrize(
    ("raw", "must_keep", "must_mask"),
    [
        # --- диагностические идентификаторы: не трогаем ---
        ('{"item_id": "1234567890"}', "1234567890", None),
        ("timeSec 1728044400", "1728044400", None),
        ("Товар SKU-1234567890", "SKU-1234567890", None),
        ("артикул ART-9876543210", "ART-9876543210", None),
        ("ячейка A-12-03-07", "A-12-03-07", None),
        (
            "uuid 550e8400-e29b-41d4-a716-446655440000",
            "550e8400-e29b-41d4-a716-446655440000",
            None,
        ),
        ("order_id 42", "42", None),
        # валидный ИНН как order_id — аудит НЕ маскирует (иначе ломается диагностика)
        (f'{{"order_id": {_VALID_INN_12}}}', _VALID_INN_12, None),
        ("qty=100", "100", None),
        # голые 11 цифр — не СНИЛС (нет разделителей)
        ("seq 12345678901", "12345678901", None),
        # голый валидный ИНН без метки — аудит сохраняет
        (_VALID_INN_10, _VALID_INN_10, None),
        # --- реальные ПДн / секреты (с меткой или явный формат) ---
        (f"ИНН {_VALID_INN_10}", None, "[inn]"),
        (f'{{"inn": "{_VALID_INN_10}"}}', None, "[inn]"),
        (f"tax_id={_VALID_INN_12}", None, "[inn]"),
        (f"СНИЛС {_VALID_SNILS}", None, "[snils]"),
        ("Связь: ops@example.com", None, "[email]"),
        ("тел. +7 (999) 123-45-67", None, "[phone]"),
        ("паспорт 4510 123456", None, "[passport]"),
        (f"Карта {_VALID_CARD}", None, "[card]"),
    ],
)
def test_redact_audit_table(
    raw: str, must_keep: str | None, must_mask: str | None
) -> None:
    out = redact_audit(raw)
    if must_keep is not None:
        assert must_keep in out, f"ожидали сохранить {must_keep!r} в {out!r}"
        assert "[inn]" not in out
        assert "[snils]" not in out
    if must_mask is not None:
        assert must_mask in out, f"ожидали {must_mask!r} в {out!r}"


def test_redact_pii_vs_audit_bare_inn_differs() -> None:
    """Жёсткий redact_pii маскирует голый ИНН; мягкий redact_audit — нет."""
    raw = f'{{"order_id": {_VALID_INN_12}}}'
    audit = redact_audit(raw)
    pii = redact_pii(raw)
    assert audit != pii
    assert _VALID_INN_12 in audit
    assert "[inn]" not in audit
    assert _VALID_INN_12 not in pii
    assert "[inn]" in pii


def test_sanitize_for_log_alias() -> None:
    raw = "mail a@b.co и id 1234567890"
    assert sanitize_for_log(raw) == redact_audit(raw)
    assert "1234567890" in sanitize_for_log(raw)
    assert "[email]" in sanitize_for_log(raw)


def test_args_preview_keeps_item_id() -> None:
    raw_s = '{"item_id": "1234567890", "qty": 3}'
    preview = redact_audit(raw_s)[:400]
    assert "1234567890" in preview
    assert "[inn]" not in preview


def test_redact_pii_masks_labeled_and_valid_inn() -> None:
    out = redact_pii(f"Клиент ИНН {_VALID_INN_12}, склад SKU-1234567890")
    assert _VALID_INN_12 not in out
    assert "[inn]" in out
    assert "SKU-1234567890" in out


def test_redact_email_and_phone() -> None:
    raw = "Связь: ops@example.com, тел. +7 (999) 123-45-67"
    out = redact_pii(raw)
    assert "ops@example.com" not in out
    assert "[email]" in out
    assert "+7 (999) 123-45-67" not in out
    assert "[phone]" in out


def test_redact_inn_snils_passport() -> None:
    raw = f"ИНН {_VALID_INN_10}, СНИЛС {_VALID_SNILS}, паспорт 4510 123456"
    out = redact_pii(raw)
    assert _VALID_INN_10 not in out
    assert "[inn]" in out
    assert "112-233-445 95" not in out
    assert "[snils]" in out
    assert "4510 123456" not in out
    assert "[passport]" in out


def test_invalid_snils_format_kept() -> None:
    # Неверный контроль — не маскируем (иначе съедим похожие коды).
    raw = "код 111-111-111 00"
    assert redact_audit(raw) == raw


def test_invalid_inn_checksum_kept() -> None:
    raw = "номер 1234567890"
    assert "1234567890" in redact_audit(raw)
    assert "[inn]" not in redact_audit(raw)


def test_redact_card_luhn() -> None:
    raw = f"Карта {_VALID_CARD} для возврата"
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
    out = redact_user_message(f"  ИНН {_VALID_INN_12} и mail user@test.ru  ")
    assert _VALID_INN_12 not in out
    assert "user@test.ru" not in out
    assert "[inn]" in out
    assert "[email]" in out
