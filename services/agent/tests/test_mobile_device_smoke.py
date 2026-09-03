"""Device-like authenticated end-to-end workflow using a real temporary project."""

import json
import shutil
from pathlib import Path
from time import perf_counter

from fastapi import FastAPI
from starlette.testclient import TestClient, WebSocketTestSession

from pocketpilot_agent.config import Settings
from pocketpilot_agent.main import create_app


def _event_until(socket: WebSocketTestSession, expected_name: str) -> tuple[int, list[str]]:
    names: list[str] = []
    last_sequence = 0
    while expected_name not in names:
        message = socket.receive_json()
        if message["type"] == "snapshot":
            events = message["events"]
        else:
            events = [message["event"]]
        for event in events:
            names.append(event["name"])
            last_sequence = max(last_sequence, event["sequence"])
    return last_sequence, names


def test_phone_like_pair_analyze_patch_verify_rollback_and_reconnect(
    tmp_path: Path,
) -> None:
    source_demo = Path(__file__).parents[3] / "demo" / "python-broken-app"
    workspace = tmp_path / "mobile-smoke-workspace"
    shutil.copytree(source_demo, workspace)
    database = tmp_path / "mobile-smoke.db"
    app: FastAPI = create_app(
        Settings(session_database_path=str(database), llm_provider="mock")
    )
    original = (workspace / "user_service.py").read_bytes()
    timings: dict[str, int] = {}

    with TestClient(app) as laptop:
        selected = laptop.post(
            "/api/v1/workspaces/inspect", json={"root_path": str(workspace)}
        )
        start = perf_counter()
        pairing = laptop.post("/api/v1/devices/pairing-code").json()
        timings["pairing_code_ms"] = round((perf_counter() - start) * 1000)
        assert selected.status_code == 200

    with TestClient(app, client=("192.0.2.50", 52000)) as phone:
        start = perf_counter()
        paired = phone.post(
            "/api/v1/devices/pair",
            json={"code": pairing["code"], "display_name": "Smoke iQOO"},
        )
        timings["pairing_ms"] = round((perf_counter() - start) * 1000)
        assert paired.status_code == 200
        token = paired.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        start = perf_counter()
        created = phone.post(
            "/api/v1/sessions", headers=headers, json={"title": "Mobile smoke"}
        ).json()
        captured = phone.post(
            f"/api/v1/sessions/{created['session']['id']}/transitions",
            headers=headers,
            json={
                "target_state": "CAPTURED",
                "expected_revision": 0,
                "summary": "Captured from phone-like client.",
            },
        ).json()
        timings["session_start_ms"] = round((perf_counter() - start) * 1000)
        session_id = created["session"]["id"]

        start = perf_counter()
        with phone.websocket_connect(
            f"/api/v1/sessions/{session_id}/events/ws"
        ) as socket:
            socket.send_json({"type": "authenticate", "token": token})
            snapshot = socket.receive_json()
            timings["websocket_connect_ms"] = round((perf_counter() - start) * 1000)
            assert snapshot["session"]["state"] == "CAPTURED"

            start = perf_counter()
            analyzed = phone.post(
                f"/api/v1/sessions/{session_id}/analyze",
                headers=headers,
                json={
                    "input_type": "TEXT",
                    "raw_text": (workspace / "fixtures" / "traceback.txt").read_text(
                        encoding="utf-8"
                    ),
                    "file_hint": "user_service.py",
                    "language_hint": "Python",
                    "framework_hint": "pytest",
                    "expected_revision": captured["session"]["revision"],
                },
            ).json()
            timings["analysis_ms"] = round((perf_counter() - start) * 1000)
            start = perf_counter()
            sequence, analysis_events = _event_until(socket, "root_cause_found")
            timings["event_reconcile_ms"] = round((perf_counter() - start) * 1000)
            assert analyzed["session"]["state"] == "ROOT_CAUSE_FOUND"
            assert "analysis_provider_started" in analysis_events

            start = perf_counter()
            generated = phone.post(
                f"/api/v1/sessions/{session_id}/patches/generate",
                headers=headers,
                json={"expected_revision": analyzed["session"]["revision"]},
            ).json()
            timings["patch_generation_ms"] = round((perf_counter() - start) * 1000)
            sequence, patch_events = _event_until(socket, "patch_awaiting_approval")
            workflow = generated["workflow"]
            assert generated["session"]["state"] == "AWAITING_APPROVAL"
            assert workflow["proposal"]["files"][0]["unified_diff"]
            assert "patch_validation_completed" in patch_events
            assert (workspace / "user_service.py").read_bytes() == original

            start = perf_counter()
            approved = phone.post(
                f"/api/v1/sessions/{session_id}/patches/{workflow['proposal']['id']}/approve",
                headers=headers,
                json={"expected_revision": generated["session"]["revision"]},
            ).json()
            timings["apply_and_verify_ms"] = round((perf_counter() - start) * 1000)
            sequence, apply_events = _event_until(socket, "tests_passed")
            assert approved["session"]["state"] == "SUCCESS"
            assert approved["workflow"]["test_result"]["passed"] is True
            assert "patch_file_applied" in apply_events

            start = perf_counter()
            rolled_back = phone.post(
                f"/api/v1/sessions/{session_id}/patches/{workflow['proposal']['id']}/rollback",
                headers=headers,
                json={"expected_revision": approved["session"]["revision"]},
            ).json()
            timings["rollback_ms"] = round((perf_counter() - start) * 1000)
            sequence, _ = _event_until(socket, "rollback_completed")
            assert rolled_back["session"]["state"] == "ROLLED_BACK"
            assert (workspace / "user_service.py").read_bytes() == original

        start = perf_counter()
        with phone.websocket_connect(
            f"/api/v1/sessions/{session_id}/events/ws?after_sequence={sequence}"
        ) as reconnected:
            reconnected.send_json({"type": "authenticate", "token": token})
            recovered = reconnected.receive_json()
        timings["reconnect_ms"] = round((perf_counter() - start) * 1000)
        assert recovered["type"] == "snapshot"
        assert recovered["session"]["state"] == "ROLLED_BACK"
        assert recovered["patch"]["status"] == "ROLLED_BACK"

    print(f"M5_SMOKE_METRICS={json.dumps(timings, sort_keys=True)}")
