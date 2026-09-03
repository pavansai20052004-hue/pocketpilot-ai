"""Short-lived pairing codes and hashed device-token persistence."""

from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import RLock
from uuid import uuid4

from pocketpilot_agent.models import (
    DevicePermission,
    DeviceStatus,
    DeviceView,
    PairDeviceResponse,
    PairingCodeView,
)


class PairingError(Exception):
    """Base pairing failure safe to expose to a client."""


class PairingCodeExpiredError(PairingError):
    """The current pairing code is absent or expired."""


class PairingAttemptLimitError(PairingError):
    """The pairing code exhausted its allowed guesses."""


class InvalidPairingCodeError(PairingError):
    """A pairing code did not match."""


class DeviceAuthenticationError(Exception):
    """An opaque token is missing, unknown, or expired."""


class DeviceRevokedError(DeviceAuthenticationError):
    """The matching device was explicitly revoked."""


@dataclass
class _PairingCode:
    value: str
    expires_at: datetime
    attempts_remaining: int


ALL_DEVICE_PERMISSIONS = list(DevicePermission)


class DeviceRegistry:
    """Own pairing state and persist only hashes and minimal device metadata."""

    def __init__(
        self,
        database_path: str,
        *,
        pairing_ttl_seconds: int = 300,
        pairing_max_attempts: int = 5,
        token_ttl_seconds: int = 86_400,
    ) -> None:
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.pairing_ttl_seconds = pairing_ttl_seconds
        self.pairing_max_attempts = pairing_max_attempts
        self.token_ttl_seconds = token_ttl_seconds
        self._pairing: _PairingCode | None = None
        self._lock = RLock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS devices (
                    device_id TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    paired_at TEXT NOT NULL,
                    last_seen TEXT NOT NULL,
                    status TEXT NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    token_created_at TEXT NOT NULL,
                    token_expires_at TEXT NOT NULL,
                    permissions_json TEXT NOT NULL
                )
                """
            )

    def generate_code(self, agent_address: str, now: datetime | None = None) -> PairingCodeView:
        current = now or datetime.now(UTC)
        with self._lock:
            self._pairing = _PairingCode(
                value=f"{secrets.randbelow(1_000_000):06d}",
                expires_at=current + timedelta(seconds=self.pairing_ttl_seconds),
                attempts_remaining=self.pairing_max_attempts,
            )
            return self._pairing_view(agent_address)

    def current_code(self, agent_address: str, now: datetime | None = None) -> PairingCodeView:
        current = now or datetime.now(UTC)
        with self._lock:
            if self._pairing is None or current >= self._pairing.expires_at:
                raise PairingCodeExpiredError("Generate a new pairing code on the laptop.")
            return self._pairing_view(agent_address)

    def _pairing_view(self, agent_address: str) -> PairingCodeView:
        assert self._pairing is not None
        return PairingCodeView(
            code=self._pairing.value,
            expires_at=self._pairing.expires_at,
            attempts_remaining=self._pairing.attempts_remaining,
            agent_address=agent_address,
        )

    def pair(
        self,
        code: str,
        display_name: str,
        now: datetime | None = None,
    ) -> PairDeviceResponse:
        current = now or datetime.now(UTC)
        with self._lock:
            pairing = self._pairing
            if pairing is None or current >= pairing.expires_at:
                self._pairing = None
                raise PairingCodeExpiredError("The pairing code expired. Generate a new one.")
            if pairing.attempts_remaining <= 0:
                raise PairingAttemptLimitError(
                    "Pairing attempt limit reached. Generate a new code."
                )
            if not secrets.compare_digest(code, pairing.value):
                pairing.attempts_remaining -= 1
                if pairing.attempts_remaining == 0:
                    raise PairingAttemptLimitError(
                        "Pairing attempt limit reached. Generate a new code."
                    )
                raise InvalidPairingCodeError(
                    f"Pairing code is incorrect. {pairing.attempts_remaining} attempts remain."
                )
            self._pairing = None

        device_id = str(uuid4())
        token = secrets.token_urlsafe(32)
        expires_at = current + timedelta(seconds=self.token_ttl_seconds)
        permissions = [permission.value for permission in ALL_DEVICE_PERMISSIONS]
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO devices (
                    device_id, display_name, paired_at, last_seen, status, token_hash,
                    token_created_at, token_expires_at, permissions_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    device_id,
                    display_name,
                    current.isoformat(),
                    current.isoformat(),
                    DeviceStatus.CONNECTED.value,
                    self._hash_token(token),
                    current.isoformat(),
                    expires_at.isoformat(),
                    json.dumps(permissions),
                ),
            )
        return PairDeviceResponse(device=self.get(device_id), token=token)

    def authenticate(self, token: str, now: datetime | None = None) -> DeviceView:
        current = now or datetime.now(UTC)
        if not token:
            raise DeviceAuthenticationError("Device authentication is required.")
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM devices WHERE token_hash = ?", (self._hash_token(token),)
            ).fetchone()
            if row is None:
                raise DeviceAuthenticationError("Device token is invalid.")
            if row["status"] == DeviceStatus.REVOKED.value:
                raise DeviceRevokedError("This device has been revoked.")
            if current >= datetime.fromisoformat(row["token_expires_at"]):
                raise DeviceAuthenticationError("Device token expired. Pair again.")
            connection.execute(
                "UPDATE devices SET last_seen = ? WHERE device_id = ?",
                (current.isoformat(), row["device_id"]),
            )
        return self.get(str(row["device_id"]))

    def list(self) -> list[DeviceView]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM devices ORDER BY paired_at DESC"
            ).fetchall()
        return [self._view(row) for row in rows]

    def get(self, device_id: str) -> DeviceView:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM devices WHERE device_id = ?", (device_id,)
            ).fetchone()
        if row is None:
            raise DeviceAuthenticationError("Device was not found.")
        return self._view(row)

    def revoke(self, device_id: str) -> DeviceView:
        with self._connect() as connection:
            changed = connection.execute(
                "UPDATE devices SET status = ? WHERE device_id = ?",
                (DeviceStatus.REVOKED.value, device_id),
            ).rowcount
        if changed == 0:
            raise DeviceAuthenticationError("Device was not found.")
        return self.get(device_id)

    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def _view(row: sqlite3.Row) -> DeviceView:
        return DeviceView(
            device_id=row["device_id"],
            display_name=row["display_name"],
            paired_at=datetime.fromisoformat(row["paired_at"]),
            last_seen=datetime.fromisoformat(row["last_seen"]),
            status=DeviceStatus(row["status"]),
            token_created_at=datetime.fromisoformat(row["token_created_at"]),
            token_expires_at=datetime.fromisoformat(row["token_expires_at"]),
            permissions=[DevicePermission(value) for value in json.loads(row["permissions_json"])],
        )
