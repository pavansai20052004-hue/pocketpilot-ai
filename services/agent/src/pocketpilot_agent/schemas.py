"""Typed public API schemas for the foundation service."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

ComponentReadiness = Literal["ready", "unavailable", "not_configured"]


class StrictModel(BaseModel):
    """Base boundary model that rejects accidental untyped fields."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class HealthResponse(StrictModel):
    """Minimal liveness response."""

    status: Literal["ok"]
    service: str
    version: str


class ComponentStatus(StrictModel):
    """Readiness of foundation-owned and future components."""

    api: ComponentReadiness
    workspace: ComponentReadiness
    model: ComponentReadiness


class SystemStatus(StrictModel):
    """Human- and client-readable process readiness."""

    service: str
    version: str
    environment: str
    components: ComponentStatus
