"""Foundation API contract tests."""

import anyio
from httpx import ASGITransport, AsyncClient, Response

from pocketpilot_agent.main import app


async def get(path: str) -> Response:
    """Issue one in-process request without starting a network listener."""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.get(path)


def test_health_endpoint() -> None:
    response = anyio.run(get, "/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "PocketPilot Agent",
        "version": "0.1.0",
    }


def test_system_status_is_explicit_about_unimplemented_components() -> None:
    response = anyio.run(get, "/api/v1/system/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["components"] == {
        "api": "ready",
        "workspace": "not_configured",
        "model": "ready",
    }


def test_openapi_publishes_typed_health_schema() -> None:
    response = anyio.run(get, "/openapi.json")

    assert response.status_code == 200
    schemas = response.json()["components"]["schemas"]
    assert "HealthResponse" in schemas
    assert schemas["HealthResponse"]["additionalProperties"] is False
