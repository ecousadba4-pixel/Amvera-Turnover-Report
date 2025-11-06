"""Утилиты для загрузки SQL-шаблонов из каталога app.sql."""

from __future__ import annotations

from functools import lru_cache
from importlib import resources

from psycopg import sql


class QueryNotFoundError(FileNotFoundError):
    """Возникает, если запрошенный SQL-файл отсутствует."""


@lru_cache
def load_query(name: str) -> sql.SQL:
    """Загружает и компилирует SQL-шаблон из пакета ``app.sql``.

    Поскольку ``psycopg.sql`` ожидает объект :class:`~psycopg.sql.SQL`,
    мы приводим текст запроса к этому типу и используем кеширование,
    чтобы исключить повторное чтение файлов при множественных вызовах.
    """

    try:
        query_path = resources.files("app.sql").joinpath(name)
    except FileNotFoundError as exc:  # pragma: no cover - зависимость от окружения
        raise QueryNotFoundError(f"SQL-шаблон '{name}' не найден") from exc

    if not query_path.is_file():
        raise QueryNotFoundError(f"SQL-шаблон '{name}' не найден")

    text = query_path.read_text(encoding="utf-8")
    return sql.SQL(text)


__all__ = ["load_query"]

