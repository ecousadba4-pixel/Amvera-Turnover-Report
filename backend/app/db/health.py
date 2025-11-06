"""Вспомогательные проверки состояния подключений к базе данных."""

from __future__ import annotations

import asyncio

from psycopg import Error as PsycopgError

from . import fetchone

_DEFAULT_TIMEOUT_SECONDS = 5.0


async def check_database(dsn: str, *, timeout: float = _DEFAULT_TIMEOUT_SECONDS) -> tuple[bool, str | None]:
    """Пробует выполнить простейший запрос ``SELECT 1``.

    Возвращает кортеж ``(<статус>, <ошибка>)``. При ``timeout`` ожидание подключения
    и выполнения запроса будет ограничено указанным числом секунд, чтобы не
    зависнуть в случаях, когда база данных недоступна или не отвечает.
    """
    try:
        await asyncio.wait_for(fetchone("SELECT 1", dsn=dsn), timeout=timeout)
        return True, None
    except asyncio.TimeoutError:
        return False, "Timed out while connecting to the database"
    except PsycopgError as exc:
        return False, str(exc)
    except Exception as exc:
        return False, str(exc)


__all__ = ["check_database"]
