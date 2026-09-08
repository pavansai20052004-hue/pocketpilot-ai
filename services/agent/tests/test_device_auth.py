"""Pairing, device-token, HTTP boundary, and WebSocket authentication tests."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from pocketpilot_agent.config import Settings
from pocketpilot_agent.device_registry import (
    DeviceAuthenticationError,
    DeviceRegistry,
    DeviceRevokedError,
    InvalidPairingCodeError,
    PairingAttemptLimitError,
    PairingCodeExpiredError,
)
from pocketpilot_agent.main import create_app


def registry(tmp_path: Path, **overrides: int) -> DeviceRegistry:
    return DeviceRegistry(
        str(tmp_path / "devices.db"),
        pairing_ttl_seconds=overrides.get("pairing_ttl_seconds", 300),
        pairing_max_attempts=overrides.get("pairing_max_attempts", 5),
        token_ttl_seconds=overrides.get("token_ttl_seconds", 3600),
    )


def app_for(tmp_path: Path) -> FastAPI:
    return create_app(Settings(session_database_path=str(tmp_path / "sessions.db")))


def test_valid_code_pairs_once_and_token_authenticates(tmp_path: Path) -> None:
    devices = registry(tmp_path)
    pairing = devices.generate_code("192.0.2.1:8000")
    paired = devices.pair(pairing.code, "Pavan's iQOO")

    assert paired.device.display_name == "Pavan's iQOO"
    assert devices.authenticate(paired.token).device_id == paired.device.device_id
    with pytest.raises(PairingCodeExpiredError):
        devices.pair(pairing.code, "Second phone")


def test_expired_and_wrong_codes_are_rejected(tmp_path: Path) -> None:
    devices = registry(tmp_path)
    now = datetime.now(UTC)
    pairing = devices.generate_code("192.0.2.1:8000", now)

    with pytest.raises(InvalidPairingCodeError):
        devices.pair("000000" if pairing.code != "000000" else "111111", "Phone", now)
    with pytest.raises(PairingCodeExpiredError):
        devices.pair(pairing.code, "Phone", now + timedelta(minutes=6))


def test_pairing_attempt_limit_blocks_further_guesses(tmp_path: Path) -> None:
    devices = registry(tmp_path, pairing_max_attempts=2)
    pairing = devices.generate_code("192.0.2.1:8000")
    wrong = "000000" if pairing.code != "000000" else "111111"

    with pytest.raises(InvalidPairingCodeError):
        devices.pair(wrong, "Phone")
    with pytest.raises(PairingAttemptLimitError):
        devices.pair(wrong, "Phone")
    with pytest.raises(PairingAttemptLimitError):
        devices.pair(pairing.code, "Phone")


def test_expired_and_revoked_tokens_are_rejected(tmp_path: Path) -> None:
    devices = registry(tmp_path, token_ttl_seconds=10)
    now = datetime.now(UTC)
    pairing = devices.generate_code("192.0.2.1:8000", now)
    paired = devices.pair(pairing.code, "Phone", now)

    with pytest.raises(DeviceAuthenticationError, match="expired"):
        devices.authenticate(paired.token, now + timedelta(seconds=11))
    devices.revoke(paired.device.device_id)
    with pytest.raises(DeviceRevokedError):
        devices.authenticate(paired.token, now)


def test_lan_http_requires_valid_token_and_revocation_is_immediate(tmp_path: Path) -> None:
    app = app_for(tmp_path)
    with TestClient(app) as laptop:
        pairing = laptop.post("/api/v1/devices/pairing-code").json()
    with TestClient(app, client=("192.0.2.20", 50000)) as phone:
        unauthorized = phone.get("/api/v1/workspaces/current")
        paired = phone.post(
            "/api/v1/devices/pair",
            json={"code": pairing["code"], "display_name": "iQOO test"},
        ).json()
        authorized = phone.get(
            "/api/v1/workspaces/current",
            headers={"Authorization": f"Bearer {paired['token']}"},
        )

    assert unauthorized.status_code == 401
    assert authorized.status_code == 404
    with TestClient(app) as laptop:
        laptop.post(f"/api/v1/devices/{paired['device']['device_id']}/revoke")
    with TestClient(app, client=("192.0.2.20", 50000)) as phone:
        revoked = phone.get(
            "/api/v1/workspaces/current",
            headers={"Authorization": f"Bearer {paired['token']}"},
        )
        forbidden_admin = phone.post("/api/v1/devices/pairing-code")
    assert revoked.status_code == 403
    assert forbidden_admin.status_code == 403


def test_pairing_code_uses_configured_advertised_host(tmp_path: Path) -> None:
    app = create_app(
        Settings(
            session_database_path=str(tmp_path / "sessions.db"),
            advertised_host="192.168.50.12",
        )
    )

    with TestClient(app) as laptop:
        pairing = laptop.post("/api/v1/devices/pairing-code")

    assert pairing.status_code == 200
    assert pairing.json()["agent_address"] == "192.168.50.12:8000"


def test_websocket_rejects_unauthorized_and_accepts_authorized_phone(tmp_path: Path) -> None:
    app = app_for(tmp_path)
    with TestClient(app) as laptop:
        pairing = laptop.post("/api/v1/devices/pairing-code").json()
    with TestClient(app, client=("192.0.2.20", 50000)) as phone:
        paired = phone.post(
            "/api/v1/devices/pair",
            json={"code": pairing["code"], "display_name": "iQOO test"},
        ).json()
        created = phone.post(
            "/api/v1/sessions",
            headers={"Authorization": f"Bearer {paired['token']}"},
            json={"title": "Mobile auth"},
        ).json()
        session_id = created["session"]["id"]

        with pytest.raises(WebSocketDisconnect) as rejected:
            with phone.websocket_connect(
                f"/api/v1/sessions/{session_id}/events/ws"
            ) as websocket:
                websocket.send_json({"type": "authenticate", "token": "invalid"})
                websocket.receive_json()
        with phone.websocket_connect(
            f"/api/v1/sessions/{session_id}/events/ws"
        ) as websocket:
            websocket.send_json({"type": "authenticate", "token": paired["token"]})
            snapshot = websocket.receive_json()
            with TestClient(app) as laptop:
                laptop.post(
                    f"/api/v1/devices/{paired['device']['device_id']}/revoke"
                )
                laptop.post(
                    f"/api/v1/sessions/{session_id}/transitions",
                    json={
                        "target_state": "CAPTURED",
                        "expected_revision": 0,
                        "summary": "Trigger active socket revalidation.",
                    },
                )
            with pytest.raises(WebSocketDisconnect) as revoked:
                websocket.receive_json()

    assert rejected.value.code == 4401
    assert snapshot["type"] == "snapshot"
    assert snapshot["session"]["id"] == session_id
    assert revoked.value.code == 4403
