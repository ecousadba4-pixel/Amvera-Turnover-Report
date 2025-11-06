from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, Optional, Tuple, TypeVar

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

__all__ = [
    "fetchone",
    "fetchall",
    "get_conn",
    "close_all_pools",
    "use_database",
]

_pool_lock = asyncio.Lock()
_pools: Dict[str, AsyncConnectionPool] = {}


_current_dsn: ContextVar[Optional[str]] = ContextVar("current_db_dsn", default=None)


_POOL_CONFIG = {
    "min_size": 1,
    "max_size": 10,
    "timeout": 30,
    "max_lifetime": 60 * 60,
    "max_idle": 5 * 60,
}


def _create_pool(dsn: str) -> AsyncConnectionPool:
    """Instantiate an async connection pool configured to return dict rows."""

    return AsyncConnectionPool(
        conninfo=dsn,
        kwargs={"row_factory": dict_row},
        **_POOL_CONFIG,
    )


async def _get_or_create_pool(dsn: str) -> AsyncConnectionPool:
    """Return a cached async connection pool, creating it if necessary."""

    async with _pool_lock:
        pool = _pools.get(dsn)
        if pool is None:
            pool = _create_pool(dsn)
            _pools[dsn] = pool
            await pool.open()
    return pool


async def _reset_pool(dsn: str) -> None:
    """Close and drop the cached pool for the given DSN if it exists."""

    async with _pool_lock:
        pool = _pools.pop(dsn, None)

    if pool is not None:
        await pool.close()


def _resolve_dsn(dsn: Optional[str]) -> str:
    current = dsn if dsn else _current_dsn.get()
    if not current:
        raise RuntimeError("Database DSN is not configured for the current context")
    return current


@asynccontextmanager
async def use_database(dsn: str) -> AsyncIterator[None]:
    token = _current_dsn.set(dsn)
    try:
        yield
    finally:
        _current_dsn.reset(token)


@asynccontextmanager
async def get_conn(dsn: Optional[str] = None) -> AsyncIterator[psycopg.AsyncConnection]:
    """Yield a pooled async connection configured to return dict rows."""

    resolved_dsn = _resolve_dsn(dsn)
    pool = await _get_or_create_pool(resolved_dsn)
    async with pool.connection() as conn:
        yield conn


TResult = TypeVar("TResult")
_RETRYABLE_EXCEPTIONS: Tuple[type[Exception], ...] = (
    psycopg.OperationalError,
    psycopg.InterfaceError,
)


async def _run_with_retry(
    dsn: Optional[str],
    operation: Callable[[psycopg.AsyncConnection], Awaitable[TResult]],
    *,
    retries: int = 1,
) -> TResult:
    """Execute the given operation, retrying once on transient connection errors."""

    resolved_dsn = _resolve_dsn(dsn)
    attempt = 0
    while True:
        try:
            async with get_conn(resolved_dsn) as conn:
                return await operation(conn)
        except _RETRYABLE_EXCEPTIONS:
            attempt += 1
            if attempt > retries:
                raise
            await _reset_pool(resolved_dsn)


async def fetchone(
    query: psycopg.sql.Composable | str,
    params: Optional[dict[str, Any]] = None,
    *,
    dsn: Optional[str] = None,
    retries: int = 1,
) -> Optional[dict[str, Any]]:
    """Execute a query and return the first row, retrying on connection failures."""

    params = params or {}

    async def _operation(conn: psycopg.AsyncConnection) -> Optional[dict[str, Any]]:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            return await cur.fetchone()

    return await _run_with_retry(dsn, _operation, retries=retries)


async def fetchall(
    query: psycopg.sql.Composable | str,
    params: Optional[dict[str, Any]] = None,
    *,
    dsn: Optional[str] = None,
    retries: int = 1,
) -> list[dict[str, Any]]:
    """Execute a query and return all rows, retrying on connection failures."""

    params = params or {}

    async def _operation(conn: psycopg.AsyncConnection) -> list[dict[str, Any]]:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            rows = await cur.fetchall()
            return list(rows or [])

    return await _run_with_retry(dsn, _operation, retries=retries)


async def close_all_pools() -> None:
    """Close and clear all cached async connection pools."""

    async with _pool_lock:
        pools = list(_pools.items())
        _pools.clear()

    for _, pool in pools:
        await pool.close()
