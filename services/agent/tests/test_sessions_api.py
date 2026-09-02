"""Session HTTP and reconnect-safe WebSocket API tests."""

from pathlib import Path

import anyio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response
from starlette.testclient import TestClient

from pocketpilot_agent.config import Settings
from pocketpilot_agent.main import create_app


def build_app(tmp_path: Path) -> FastAPI:
    return create_app(
        Settings(session_database_path=str(tmp_path / "sessions.db"))
    )


async def request(
    app: FastAPI,
    method: str,
    path: str,
    json: dict[str, object] | None = None,
) -> Response:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.request(method, path, json=json)


def create_session(app: FastAPI, title: str = "Fixture") -> dict[str, object]:
    response = anyio.run(
        request, app, "POST", "/api/v1/sessions", {"title": title}
    )
    assert response.status_code == 200
    return response.json()


def transition(
    app: FastAPI,
    session_id: str,
    target_state: str,
    revision: int,
) -> Response:
    return anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/transitions",
        {
            "target_state": target_state,
            "expected_revision": revision,
            "summary": f"Transitioned to {target_state}.",
        },
    )


def test_create_session_returns_typed_initial_event(tmp_path: Path) -> None:
    created = create_session(build_app(tmp_path), "Terminal error")

    assert created["session"]["state"] == "IDLE"
    assert created["session"]["revision"] == 0
    assert created["event"]["name"] == "session_started"
    assert created["event"]["sequence"] == 1


def test_valid_transitions_advance_revision_and_sequence(tmp_path: Path) -> None:
    app = build_app(tmp_path)
    created = create_session(app)
    session_id = created["session"]["id"]
    captured = transition(app, session_id, "CAPTURED", 0)
    analyzing = transition(app, session_id, "ANALYZING", 1)

    assert captured.status_code == 200
    assert captured.json()["event"]["sequence"] == 2
    assert analyzing.json()["session"]["revision"] == 2
    assert analyzing.json()["event"]["name"] == "analysis_started"


def test_invalid_and_stale_transitions_return_conflict_without_traceback(
    tmp_path: Path,
) -> None:
    app = build_app(tmp_path)
    created = create_session(app)
    session_id = created["session"]["id"]
    invalid = transition(app, session_id, "SUCCESS", 0)
    captured = transition(app, session_id, "CAPTURED", 0)
    stale = transition(app, session_id, "ANALYZING", 0)

    assert invalid.status_code == 409
    assert captured.status_code == 200
    assert stale.status_code == 409
    assert "Traceback" not in invalid.text + stale.text
    events = anyio.run(
        request, app, "GET", f"/api/v1/sessions/{session_id}/events"
    )
    assert len(events.json()["events"]) == 2


def test_session_list_and_cursor_endpoint(tmp_path: Path) -> None:
    app = build_app(tmp_path)
    created = create_session(app, "List fixture")
    session_id = created["session"]["id"]
    transition(app, session_id, "CAPTURED", 0)
    sessions = anyio.run(request, app, "GET", "/api/v1/sessions")
    events = anyio.run(
        request,
        app,
        "GET",
        f"/api/v1/sessions/{session_id}/events?after_sequence=1",
    )

    assert sessions.json()["sessions"][0]["id"] == session_id
    assert [event["sequence"] for event in events.json()["events"]] == [2]
    assert events.json()["current_state"] == "CAPTURED"


def test_websocket_reconnect_snapshot_contains_current_state_and_missed_events(
    tmp_path: Path,
) -> None:
    app = build_app(tmp_path)
    with TestClient(app) as client:
        created = client.post("/api/v1/sessions", json={"title": "Reconnect fixture"}).json()
        session_id = created["session"]["id"]
        transitioned = client.post(
            f"/api/v1/sessions/{session_id}/transitions",
            json={
                "target_state": "CAPTURED",
                "expected_revision": 0,
                "summary": "Captured while disconnected.",
            },
        )
        assert transitioned.status_code == 200

        with client.websocket_connect(
            f"/api/v1/sessions/{session_id}/events/ws?after_sequence=1"
        ) as websocket:
            snapshot = websocket.receive_json()

    assert snapshot["type"] == "snapshot"
    assert snapshot["session"]["state"] == "CAPTURED"
    assert [event["sequence"] for event in snapshot["events"]] == [2]


def test_unknown_session_returns_404(tmp_path: Path) -> None:
    response = anyio.run(
        request, build_app(tmp_path), "GET", "/api/v1/sessions/missing"
    )

    assert response.status_code == 404


def test_whitespace_only_session_text_is_rejected(tmp_path: Path) -> None:
    app = build_app(tmp_path)
    title_response = anyio.run(
        request, app, "POST", "/api/v1/sessions", {"title": "   "}
    )
    created = create_session(app)
    session_id = created["session"]["id"]
    summary_response = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/transitions",
        {
            "target_state": "CAPTURED",
            "expected_revision": 0,
            "summary": "   ",
        },
    )

    assert title_response.status_code == 422
    assert summary_response.status_code == 422
