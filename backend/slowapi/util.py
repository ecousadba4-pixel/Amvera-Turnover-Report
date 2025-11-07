from __future__ import annotations

from fastapi import Request


def get_remote_address(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    client = request.client
    if client is not None and client.host:
        return client.host
    return "anonymous"


__all__ = ["get_remote_address"]
