"""Сохранить схему OpenAPI в frontend/openapi.json (нужен для npm run generate-client)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

# корень репозитория: backend/scripts -> repo
REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "frontend" / "openapi.json"


def main() -> None:
    from app.main import app

    OUT.parent.mkdir(parents=True, exist_ok=True)
    schema = app.openapi()
    OUT.write_text(json.dumps(schema, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
