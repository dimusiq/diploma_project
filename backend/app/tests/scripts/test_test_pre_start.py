from unittest.mock import ANY, MagicMock, patch

from app.tests_pre_start import init, logger


def test_init_successful_connection() -> None:
    engine_mock = MagicMock()

    session_mock = MagicMock()
    exec_mock = MagicMock(return_value=True)
    session_mock.configure_mock(**{"exec.return_value": exec_mock})

    session_factory_mock = MagicMock()
    session_factory_mock.return_value.__enter__.return_value = session_mock
    session_factory_mock.return_value.__exit__.return_value = False

    with (
        patch("app.tests_pre_start.Session", session_factory_mock),
        patch.object(logger, "info"),
        patch.object(logger, "error"),
        patch.object(logger, "warn"),
    ):
        try:
            init(engine_mock)
            connection_successful = True
        except Exception:
            connection_successful = False

        assert (
            connection_successful
        ), "The database connection should be successful and not raise an exception."

        session_mock.exec.assert_called_once_with(ANY)
