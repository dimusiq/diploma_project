"""Хранение и обработка аватаров пользователей (WebP на диске)."""

from __future__ import annotations

import io
import uuid
from pathlib import Path

from fastapi import HTTPException
from PIL import Image

from app.core.config import settings

MAX_AVATAR_UPLOAD_BYTES = 2 * 1024 * 1024


def avatar_file_path(user_id: uuid.UUID, ext: str) -> Path:
    return settings.avatar_storage_dir / f"{user_id}.{ext}"


def ensure_avatar_storage_dir() -> None:
    settings.avatar_storage_dir.mkdir(parents=True, exist_ok=True)


def process_avatar_image(raw: bytes) -> tuple[bytes, str]:
    """Сжимает изображение (макс. 512 px). Сначала WebP; при недоступном кодеке — PNG."""
    if len(raw) > MAX_AVATAR_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400, detail="Файл слишком большой (максимум 2 МБ)"
        )
    try:
        bio = io.BytesIO(raw)
        img = Image.open(bio)
        img.load()
    except Exception:
        raise HTTPException(
            status_code=400, detail="Недопустимый формат изображения"
        )
    bio.seek(0)
    img = Image.open(bio)
    img = img.convert("RGBA")
    img.thumbnail((512, 512), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    try:
        img.save(out, format="WEBP", quality=85, method=4)
        return out.getvalue(), "webp"
    except Exception:
        out = io.BytesIO()
        img.save(out, format="PNG", optimize=True)
        return out.getvalue(), "png"
