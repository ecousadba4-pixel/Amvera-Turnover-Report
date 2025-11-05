from __future__ import annotations

from contextlib import contextmanager
from threading import RLock
from typing import Dict, Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

_pool_lock = RLock()
_pools: Dict[str, ConnectionPool] = {}


def _create_pool(dsn: str) -> ConnectionPool:
    """Instantiate a connection pool configured to return dict rows."""

    return ConnectionPool(conninfo=dsn, kwargs={"row_factory": dict_row})


def _get_or_create_pool(dsn: str) -> ConnectionPool:
    """Return a cached connection pool, creating it if necessary."""

    with _pool_lock:
        pool = _pools.get(dsn)
        if pool is None:
            pool = _create_pool(dsn)
            _pools[dsn] = pool
    return pool


@contextmanager
def get_conn(dsn: str) -> Iterator[psycopg.Connection]:
    """Yield a pooled connection configured to return dict rows."""

    pool = _get_or_create_pool(dsn)
    with pool.connection() as conn:
        yield conn


def close_all_pools() -> None:
    """Close and clear all cached connection pools."""

    with _pool_lock:
        for dsn, pool in list(_pools.items()):
            pool.close()
            _pools.pop(dsn, None)
