"""Foundation API contract tests."""

from pathlib import Path

import anyio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from pocketpilot_agent.config import Settings
from pocketpilot_agent.main import app, create_app


async def get(path: str, application: FastAPI = app) -> Response:
    """Issue one in-process request without starting a network listener."""

    transport = ASGITransport(app=application)
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


def test_system_status_reports_configured_but_unreachable_model_as_unavailable(
    tmp_path: Path,
) -> None:
    unavailable = create_app(
        Settings(
            llm_provider="ollama",
            ollama_base_url="http://127.0.0.1:9",
            ollama_model="missing-model",
            session_database_path=str(tmp_path / "unavailable-model.db"),
        )
    )

    response = anyio.run(get, "/api/v1/system/status", unavailable)

    assert response.status_code == 200
    assert response.json()["components"]["model"] == "unavailable"


def test_openapi_publishes_typed_health_schema() -> None:
    response = anyio.run(get, "/openapi.json")

    assert response.status_code == 200
    schemas = response.json()["components"]["schemas"]
    assert "HealthResponse" in schemas
    assert schemas["HealthResponse"]["additionalProperties"] is False
