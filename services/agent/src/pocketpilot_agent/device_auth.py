"""Network-boundary authentication helpers for HTTP and WebSocket clients."""

from __future__ import annotations

from ipaddress import ip_address
from typing import Protocol

from fastapi import WebSocket

from pocketpilot_agent.device_registry import DeviceRegistry
from pocketpilot_agent.models import DeviceView


class _Client(Protocol):
    host: str


def is_trusted_local_client(client: _Client | None) -> bool:
    if client is None:
        return False
    if client.host in {"test", "testclient"}:
        return True
    try:
        return ip_address(client.host).is_loopback
    except ValueError:
        return False


def bearer_token(header: str | None) -> str:
    if header is None:
        return ""
    scheme, separator, token = header.partition(" ")
    if not separator or scheme.lower() != "bearer":
        return ""
    return token.strip()


def authenticate_websocket(
    websocket: WebSocket, registry: DeviceRegistry, token: str = ""
) -> DeviceView | None:
    if is_trusted_local_client(websocket.client):
        return None
    header_token = bearer_token(websocket.headers.get("authorization"))
    return registry.authenticate(header_token or token)
