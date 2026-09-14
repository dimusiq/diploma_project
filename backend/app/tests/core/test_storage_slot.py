from app.core.storage_slot import (
    default_storage_cell_z,
    storage_coordinates_partial,
)


def test_default_storage_cell_z_when_xyz_missing() -> None:
    assert default_storage_cell_z(1, 2, 3, None) == 1
    assert default_storage_cell_z(1, 2, 3, 1) == 1
    assert default_storage_cell_z(None, 2, 3, None) is None


def test_partial_coords_row_level_x_without_z_is_complete() -> None:
    assert storage_coordinates_partial(2, 1, 4, None) is False
    assert storage_coordinates_partial(2, 1, None, None) is True
    assert storage_coordinates_partial(None, None, None, None) is False
