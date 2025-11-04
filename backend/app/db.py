from __future__ import annotations

from contextlib import contextmanager
from functools import cache
from typing import Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


@cache
def _get_pool(dsn: str) -> ConnectionPool:
    """Create (and memoize) a connection pool for the given DSN."""

    return ConnectionPool(conninfo=dsn, kwargs={"row_factory": dict_row})


@contextmanager
def get_conn(dsn: str) -> Iterator[psycopg.Connection]:
    """Yield a pooled connection configured to return dict rows."""

    pool = _get_pool(dsn)
    with pool.connection() as conn:
        yield conn


@cache
def column_exists(dsn: str, table: str, column: str) -> bool:
    """Check whether a table column exists, caching the result for reuse."""

    with get_conn(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = %s AND column_name = %s
            LIMIT 1
            """,
            (table, column),
        )
        return cur.fetchone() is not None
