from __future__ import annotations
import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator, Dict

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

_pool_lock = asyncio.Lock()
_pools: Dict[str, AsyncConnectionPool] = {}


def _create_pool(dsn: str) -> AsyncConnectionPool:
    """Instantiate an async connection pool configured to return dict rows."""

    return AsyncConnectionPool(conninfo=dsn, kwargs={"row_factory": dict_row})


async def _get_or_create_pool(dsn: str) -> AsyncConnectionPool:
    """Return a cached async connection pool, creating it if necessary."""

    async with _pool_lock:
        pool = _pools.get(dsn)
        if pool is None:
            pool = _create_pool(dsn)
            _pools[dsn] = pool
            await pool.open()
    return pool


@asynccontextmanager
async def get_conn(dsn: str) -> AsyncIterator[psycopg.AsyncConnection]:
    """Yield a pooled async connection configured to return dict rows."""

    pool = await _get_or_create_pool(dsn)
    async with pool.connection() as conn:
        yield conn


async def close_all_pools() -> None:
    """Close and clear all cached async connection pools."""

    async with _pool_lock:
        pools = list(_pools.items())
        _pools.clear()

    for _, pool in pools:
        await pool.close()
