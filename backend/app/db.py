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
