"""Pairing-code and paired-device administration endpoints."""

import socket
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from pocketpilot_agent.config import Settings
from pocketpilot_agent.device_auth import is_trusted_local_client
from pocketpilot_agent.device_registry import (
    DeviceAuthenticationError,
    DeviceRegistry,
    InvalidPairingCodeError,
    PairingAttemptLimitError,
    PairingCodeExpiredError,
)
from pocketpilot_agent.models import (
    DeviceList,
    DeviceView,
    PairDeviceRequest,
    PairDeviceResponse,
    PairingCodeView,
)

router = APIRouter(prefix="/api/v1/devices")


def get_registry(request: Request) -> DeviceRegistry:
    return request.app.state.device_registry


RegistryDependency = Annotated[DeviceRegistry, Depends(get_registry)]


def _require_local(request: Request) -> None:
    if not is_trusted_local_client(request.client):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Pairing administration is available only on the laptop.",
        )


def _agent_address(request: Request) -> str:
    settings: Settings = request.app.state.settings
    address = settings.advertised_host
    if not address:
        try:
            address = socket.gethostbyname(socket.gethostname())
        except OSError:
            address = "127.0.0.1"
    return f"{address}:{settings.agent_port}"


@router.post("/pairing-code", response_model=PairingCodeView, tags=["devices"])
def generate_pairing_code(request: Request, registry: RegistryDependency) -> PairingCodeView:
    _require_local(request)
    return registry.generate_code(_agent_address(request))


@router.get("/pairing-code", response_model=PairingCodeView, tags=["devices"])
def current_pairing_code(request: Request, registry: RegistryDependency) -> PairingCodeView:
    _require_local(request)
    try:
        return registry.current_code(_agent_address(request))
    except PairingCodeExpiredError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None


@router.post("/pair", response_model=PairDeviceResponse, tags=["devices"])
def pair_device(payload: PairDeviceRequest, registry: RegistryDependency) -> PairDeviceResponse:
    try:
        return registry.pair(payload.code, payload.display_name)
    except PairingCodeExpiredError as exc:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=str(exc)) from None
    except InvalidPairingCodeError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from None
    except PairingAttemptLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)
        ) from None


@router.get("", response_model=DeviceList, tags=["devices"])
def list_devices(request: Request, registry: RegistryDependency) -> DeviceList:
    _require_local(request)
    return DeviceList(devices=registry.list())


@router.post("/{device_id}/revoke", response_model=DeviceView, tags=["devices"])
def revoke_device(
    device_id: str, request: Request, registry: RegistryDependency
) -> DeviceView:
    _require_local(request)
    try:
        return registry.revoke(device_id)
    except DeviceAuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None
