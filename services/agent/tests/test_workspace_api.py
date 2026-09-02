"""End-to-end local API tests for inspection and approved command execution."""

from pathlib import Path

import anyio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from pocketpilot_agent.config import Settings
from pocketpilot_agent.main import create_app


def build_app() -> FastAPI:
    return create_app(
        Settings(
            command_timeout_seconds=10,
            max_command_output_bytes=64 * 1024,
            max_files=1000,
        )
    )


async def request(
    app: FastAPI,
    method: str,
    path: str,
    json: dict[str, str] | None = None,
) -> Response:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.request(method, path, json=json)


def test_current_workspace_requires_explicit_selection() -> None:
    response = anyio.run(request, build_app(), "GET", "/api/v1/workspaces/current")

    assert response.status_code == 404


def test_inspect_workspace_and_get_commands(react_project: Path) -> None:
    app = build_app()
    inspected = anyio.run(
        request,
        app,
        "POST",
        "/api/v1/workspaces/inspect",
        {"root_path": str(react_project)},
    )
    commands = anyio.run(
        request, app, "GET", "/api/v1/workspaces/current/commands"
    )

    assert inspected.status_code == 200
    assert commands.status_code == 200
    assert inspected.json()["project_types"][0]["project_type"] == "REACT_VITE"
    displays = {item["display_command"] for item in commands.json()["commands"]}
    assert any("run test" in display for display in displays)
    assert all("deploy" not in display for display in displays)


def test_invalid_workspace_and_traversal_return_safe_errors(tmp_path: Path) -> None:
    app = build_app()
    for root_path in (str(tmp_path / "missing"), f"{tmp_path / 'child'}\\..\\..\\Windows"):
        response = anyio.run(
            request,
            app,
            "POST",
            "/api/v1/workspaces/inspect",
            {"root_path": root_path},
        )
        assert response.status_code == 400
        assert "Traceback" not in response.text


def test_invalid_command_cannot_execute(python_project: Path) -> None:
    app = build_app()
    anyio.run(
        request,
        app,
        "POST",
        "/api/v1/workspaces/inspect",
        {"root_path": str(python_project)},
    )
    marker = python_project / "should-not-exist.txt"
    response = anyio.run(
        request,
        app,
        "POST",
        "/api/v1/commands/pytest%3Btouch%20should-not-exist.txt/run",
    )

    assert response.status_code == 400
    assert not marker.exists()


def test_execute_detected_pytest_command_and_retrieve_run(python_project: Path) -> None:
    app = build_app()
    inspected = anyio.run(
        request,
        app,
        "POST",
        "/api/v1/workspaces/inspect",
        {"root_path": str(python_project)},
    )
    command_id = next(
        item["id"]
        for item in inspected.json()["detected_commands"]
        if item["category"] == "test"
    )
    executed = anyio.run(
        request, app, "POST", f"/api/v1/commands/{command_id}/run"
    )

    assert executed.status_code == 200
    assert executed.json()["status"] == "PASSED"
    assert executed.json()["exit_code"] == 0
    run_id = executed.json()["id"]
    retrieved = anyio.run(
        request, app, "GET", f"/api/v1/commands/runs/{run_id}"
    )
    assert retrieved.json() == executed.json()


def test_file_index_marks_secrets_without_content(python_project: Path) -> None:
    app = build_app()
    anyio.run(
        request,
        app,
        "POST",
        "/api/v1/workspaces/inspect",
        {"root_path": str(python_project)},
    )
    response = anyio.run(
        request, app, "GET", "/api/v1/workspaces/current/files"
    )
    files = {item["relative_path"]: item for item in response.json()["files"]}

    assert files[".env"]["category"] == "excluded_sensitive"
    assert files["private.key"]["category"] == "excluded_sensitive"
    assert "content" not in files[".env"]
