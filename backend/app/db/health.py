"""Вспомогательные проверки состояния подключений к базе данных."""

from __future__ import annotations

import asyncio
from typing import Tuple

from psycopg import Error as PsycopgError

from . import fetchone

_DEFAULT_TIMEOUT_SECONDS = 5.0


async def check_database(dsn: str, *, timeout: float = _DEFAULT_TIMEOUT_SECONDS) -> Tuple[bool, str | None]:
    """Пробует выполнить простейший запрос ``SELECT 1``.

    Возвращает кортеж ``(<статус>, <ошибка>)``. При ``timeout`` ожидание подключения
    и выполнения запроса будет ограничено указанным числом секунд, чтобы не
    зависнуть в случаях, когда база данных недоступна или не отвечает.
    """

    try:
        await asyncio.wait_for(fetchone("SELECT 1", dsn=dsn), timeout=timeout)
    except asyncio.TimeoutError:
        return False, "Timed out while connecting to the database"
    except PsycopgError as exc:
        return False, str(exc)
    except Exception as exc:  # pragma: no cover - защищаемся от неожиданных ошибок
        return False, str(exc)

    return True, None


__all__ = ["check_database"]
