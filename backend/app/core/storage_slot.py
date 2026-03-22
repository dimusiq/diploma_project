"""Ключ ячейки хранения: единый контракт API и 3D (индексы 0-based в ключе, координаты в API 1-based)."""


def format_storage_slot_key(
    storage_row: int | None,
    storage_level: int | None,
    storage_cell_x: int | None,
    storage_cell_z: int | None,
) -> str | None:
    if (
        storage_row is None
        or storage_level is None
        or storage_cell_x is None
        or storage_cell_z is None
    ):
        return None
    return f"{storage_row - 1}-{storage_level - 1}-{storage_cell_x - 1}-{storage_cell_z - 1}"


def parse_storage_slot_key(slot_key: str) -> tuple[int, int, int, int] | None:
    """
    Обратное преобразование к format_storage_slot_key: ключ «0-based» → координаты API (1-based).
    Формат: "{row}-{level}-{x}-{z}".
    """
    parts = (slot_key or "").strip().split("-")
    if len(parts) != 4:
        return None
    try:
        r0, l0, x0, z0 = (int(p) for p in parts)
    except ValueError:
        return None
    return (r0 + 1, l0 + 1, x0 + 1, z0 + 1)


def storage_coordinates_partial(
    storage_row: int | None,
    storage_level: int | None,
    storage_cell_x: int | None,
    storage_cell_z: int | None,
) -> bool:
    """True, если задана только часть координат ячейки (недопустимо)."""
    coords = (storage_row, storage_level, storage_cell_x, storage_cell_z)
    any_set = any(c is not None for c in coords)
    all_set = all(c is not None for c in coords)
    return any_set and not all_set
