from pathlib import Path
from unittest.mock import Mock

import anyio
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from pocketpilot_agent.analysis_prompts import PromptBundle
from pocketpilot_agent.analysis_provider import MockLLMProvider
from pocketpilot_agent.config import Settings
from pocketpilot_agent.main import create_app
from pocketpilot_agent.models import AnalysisStatus


def build_app(tmp_path: Path) -> FastAPI:
    return create_app(
        Settings(
            session_database_path=str(tmp_path / "analysis.db"),
            llm_provider="mock",
            ollama_timeout_seconds=2,
        )
    )


async def request(
    app: FastAPI,
    method: str,
    path: str,
    payload: dict[str, object] | None = None,
) -> httpx.Response:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.request(method, path, json=payload)


def test_complete_analysis_flow_persists_result_and_events(
    tmp_path: Path, java_project: Path
) -> None:
    app = build_app(tmp_path)
    runner_spy = Mock(side_effect=AssertionError("Analysis must not execute commands."))
    app.state.workspace_service._runner.run = runner_spy
    inspected = anyio.run(
        request,
        app,
        "POST",
        "/api/v1/workspaces/inspect",
        {"root_path": str(java_project)},
    )
    created = anyio.run(request, app, "POST", "/api/v1/sessions", {"title": "Java NPE"})
    session_id = created.json()["session"]["id"]
    captured = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/transitions",
        {"target_state": "CAPTURED", "expected_revision": 0, "summary": "Text captured."},
    )
    analyzed = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/analyze",
        {
            "input_type": "TEXT",
            "raw_text": "java.lang.NullPointerException: user was null\n"
            "at demo.UserService.displayName(UserService.java:12)",
            "expected_revision": 1,
        },
    )

    assert inspected.status_code == 200
    assert captured.status_code == 200
    assert analyzed.status_code == 200
    payload = analyzed.json()
    assert payload["session"]["state"] == "ROOT_CAUSE_FOUND"
    assert payload["analysis"]["status"] == "COMPLETED"
    assert payload["analysis"]["result"]["likely_file"].endswith("UserService.java")
    assert "nullable" in payload["analysis"]["result"]["root_cause"].casefold()

    restored = anyio.run(
        request, app, "GET", f"/api/v1/sessions/{session_id}/analysis"
    )
    events = anyio.run(
        request, app, "GET", f"/api/v1/sessions/{session_id}/events"
    ).json()["events"]
    names = [event["name"] for event in events]
    assert restored.json() == payload["analysis"]
    assert names[-1] == "root_cause_found"
    assert "context_file_selected" in names
    assert all("return user.getName" not in event["summary"] for event in events)
    runner_spy.assert_not_called()

    restarted = build_app(tmp_path)
    recovered = anyio.run(
        request, restarted, "GET", f"/api/v1/sessions/{session_id}/analysis"
    )
    assert recovered.json() == payload["analysis"]


def test_provider_health_reports_mock_ready(tmp_path: Path) -> None:
    response = anyio.run(
        request, build_app(tmp_path), "GET", "/api/v1/analysis/provider"
    )

    assert response.status_code == 200
    assert response.json()["available"] is True
    assert response.json()["provider"] == "mock"


def test_camera_and_gallery_confirmed_text_preserve_provenance(
    tmp_path: Path, java_project: Path
) -> None:
    for source in ("CAMERA", "GALLERY"):
        app = build_app(tmp_path / source.lower())
        session_id = prepare_captured(app, java_project)
        response = anyio.run(
            request,
            app,
            "POST",
            f"/api/v1/sessions/{session_id}/analyze",
            {
                "input_type": source,
                "raw_text": (
                    "java.lang.NullPointerException: user was null\n"
                    "at demo.UserService.displayName(UserService.java:12)"
                ),
                "expected_revision": 1,
            },
        )

        assert response.status_code == 200
        assert response.json()["analysis"]["input_source"] == source
        restored = anyio.run(
            request, app, "GET", f"/api/v1/sessions/{session_id}/analysis"
        )
        assert restored.json()["input_source"] == source


def test_unimplemented_voice_input_remains_rejected(
    tmp_path: Path, java_project: Path
) -> None:
    app = build_app(tmp_path)
    session_id = prepare_captured(app, java_project)
    response = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/analyze",
        {"input_type": "VOICE", "raw_text": "ValueError: x", "expected_revision": 1},
    )

    assert response.status_code == 422
    assert "confirmed text" in response.json()["detail"]


def test_voice_action_provenance_is_recorded_without_changing_input_source(
    tmp_path: Path, java_project: Path
) -> None:
    app = build_app(tmp_path)
    session_id = prepare_captured(app, java_project)
    response = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/analyze",
        {
            "input_type": "TEXT",
            "raw_text": "ValueError: invalid value",
            "expected_revision": 1,
            "action_source": "VOICE",
        },
    )

    assert response.status_code == 200
    assert response.json()["analysis"]["input_source"] == "TEXT"
    events = anyio.run(
        request, app, "GET", f"/api/v1/sessions/{session_id}/events"
    ).json()["events"]
    requested = next(event for event in events if event["name"] == "analysis_requested")
    assert "confirmed voice action" in requested["summary"]


def test_analysis_requires_selected_workspace(tmp_path: Path) -> None:
    app = build_app(tmp_path)
    created = anyio.run(request, app, "POST", "/api/v1/sessions", {"title": "No root"})
    session_id = created.json()["session"]["id"]
    anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/transitions",
        {"target_state": "CAPTURED", "expected_revision": 0, "summary": "Captured."},
    )

    response = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/analyze",
        {"input_type": "TEXT", "raw_text": "ValueError: x", "expected_revision": 1},
    )

    assert response.status_code == 409
    session = anyio.run(
        request, app, "GET", f"/api/v1/sessions/{session_id}"
    ).json()
    assert session["state"] == "FAILED"


def prepare_captured(app: FastAPI, java_project: Path) -> str:
    anyio.run(
        request,
        app,
        "POST",
        "/api/v1/workspaces/inspect",
        {"root_path": str(java_project)},
    )
    created = anyio.run(request, app, "POST", "/api/v1/sessions", {"title": "Failure"})
    session_id = created.json()["session"]["id"]
    anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/transitions",
        {"target_state": "CAPTURED", "expected_revision": 0, "summary": "Captured."},
    )
    return session_id


def test_provider_timeout_transitions_to_failed(tmp_path: Path, java_project: Path) -> None:
    app = build_app(tmp_path)
    app.state.analysis_service.provider = MockLLMProvider(failure=AnalysisStatus.TIMEOUT)
    session_id = prepare_captured(app, java_project)

    response = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/analyze",
        {"input_type": "TEXT", "raw_text": "ValueError: x", "expected_revision": 1},
    )

    assert response.status_code == 504
    assert response.json()["detail"]["status"] == "TIMEOUT"
    events = anyio.run(
        request, app, "GET", f"/api/v1/sessions/{session_id}/events"
    ).json()["events"]
    assert events[-1]["name"] == "analysis_failed"
    assert events[-1]["state"] == "FAILED"


def test_invalid_response_is_repaired_once_then_fails(
    tmp_path: Path, java_project: Path
) -> None:
    app = build_app(tmp_path)
    provider = MockLLMProvider(response="not-json")
    app.state.analysis_service.provider = provider
    session_id = prepare_captured(app, java_project)

    response = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/analyze",
        {"input_type": "TEXT", "raw_text": "ValueError: x", "expected_revision": 1},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["status"] == "INVALID_RESPONSE"
    assert app.state.debug_session_service.get(session_id).state == "FAILED"
    assert provider.call_count == 2


class SlowMockProvider(MockLLMProvider):
    async def complete(self, prompt: PromptBundle) -> str:
        await anyio.sleep(0.05)
        return await super().complete(prompt)


def test_duplicate_analysis_for_same_session_is_rejected(
    tmp_path: Path, java_project: Path
) -> None:
    app = build_app(tmp_path)
    app.state.analysis_service.provider = SlowMockProvider()
    session_id = prepare_captured(app, java_project)

    async def race() -> list[int]:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            payload = {
                "input_type": "TEXT",
                "raw_text": "NullPointerException at UserService.java:12",
                "expected_revision": 1,
            }
            first, second = await asyncio.gather(
                client.post(f"/api/v1/sessions/{session_id}/analyze", json=payload),
                client.post(f"/api/v1/sessions/{session_id}/analyze", json=payload),
            )
            return [first.status_code, second.status_code]

    import asyncio

    assert sorted(anyio.run(race)) == [200, 409]


def test_analysis_websocket_streams_ordered_progress(
    tmp_path: Path, java_project: Path
) -> None:
    app = build_app(tmp_path)
    with TestClient(app) as client:
        client.post("/api/v1/workspaces/inspect", json={"root_path": str(java_project)})
        created = client.post("/api/v1/sessions", json={"title": "WebSocket"}).json()
        session_id = created["session"]["id"]
        captured = client.post(
            f"/api/v1/sessions/{session_id}/transitions",
            json={"target_state": "CAPTURED", "expected_revision": 0, "summary": "Captured."},
        ).json()
        with client.websocket_connect(
            f"/api/v1/sessions/{session_id}/events/ws?after_sequence={captured['event']['sequence']}"
        ) as websocket:
            snapshot = websocket.receive_json()
            response = client.post(
                f"/api/v1/sessions/{session_id}/analyze",
                json={
                    "input_type": "TEXT",
                    "raw_text": (
                        "java.lang.NullPointerException: user is null\n"
                        "at demo.UserService.displayName(UserService.java:12)"
                    ),
                    "expected_revision": 1,
                },
            )
            delivered = []
            while not delivered or delivered[-1]["name"] != "root_cause_found":
                delivered.append(websocket.receive_json()["event"])
        events = client.get(f"/api/v1/sessions/{session_id}/events").json()["events"]

    assert snapshot["type"] == "snapshot"
    assert response.status_code == 200
    assert [event["sequence"] for event in delivered] == list(
        range(delivered[0]["sequence"], delivered[-1]["sequence"] + 1)
    )
    assert delivered[-1]["name"] == "root_cause_found"
    sequences = [event["sequence"] for event in events]
    assert sequences == sorted(sequences)
    assert events[-1]["name"] == "root_cause_found"
