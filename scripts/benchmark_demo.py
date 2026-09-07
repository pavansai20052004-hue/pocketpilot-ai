"""Measure genuine deterministic demo workflows in disposable repository copies."""

from __future__ import annotations

import json
import shutil
import sys
import time
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent" / "src"))

from pocketpilot_agent.config import Settings  # noqa: E402
from pocketpilot_agent.main import create_app  # noqa: E402

CASES = (
    ("python-null-user", "python-broken-app", "fixtures/traceback.txt"),
    ("java-null-user", "java-broken-app", "fixtures/stacktrace.txt"),
    ("react-null-profile", "react-broken-app", "fixtures/terminal.txt"),
)


def elapsed(started: float) -> int:
    return round((time.perf_counter() - started) * 1000)


def post(client: TestClient, path: str, payload: dict[str, object] | None = None) -> dict:
    response = client.post(path, json=payload)
    response.raise_for_status()
    return response.json()


def measure(client: TestClient, demo_id: str, directory: str, fixture: str) -> dict:
    health = client.post(f"/api/v1/demo/verify/{demo_id}").json()
    if health["status"] == "TOOL_MISSING":
        return {"demo_id": demo_id, "status": "SKIPPED", "reason": health["detail"]}
    overall_started = time.perf_counter()
    reset_started = time.perf_counter()
    reset = post(client, f"/api/v1/demo/reset/{demo_id}")
    reset_ms = elapsed(reset_started)
    if reset["result"] != "DEMO_READY":
        raise RuntimeError(f"{demo_id} did not reset to DEMO_READY")

    started = time.perf_counter()
    selected = post(client, f"/api/v1/demo/select/{demo_id}")
    select_ms = elapsed(started)
    command_id = next(
        item["id"]
        for item in selected["workspace"]["detected_commands"]
        if item["category"] == "test"
    )
    started = time.perf_counter()
    failure = post(client, f"/api/v1/commands/{command_id}/run")
    initial_validation_ms = elapsed(started)
    if failure["status"] != "FAILED":
        raise RuntimeError(f"{demo_id} did not begin with a real failure")

    created = post(client, "/api/v1/sessions", {"title": f"Benchmark {demo_id}"})
    session_id = created["session"]["id"]
    captured = post(
        client,
        f"/api/v1/sessions/{session_id}/transitions",
        {
            "target_state": "CAPTURED",
            "expected_revision": 0,
            "summary": "Benchmark captured real failure.",
        },
    )
    error_text = (Path(selected["workspace"]["root_path"]) / fixture).read_text(
        encoding="utf-8"
    )
    started = time.perf_counter()
    analyzed = post(
        client,
        f"/api/v1/sessions/{session_id}/analyze",
        {
            "input_type": "TEXT",
            "raw_text": error_text,
            "expected_revision": captured["session"]["revision"],
        },
    )
    analysis_ms = elapsed(started)
    started = time.perf_counter()
    generated = post(
        client,
        f"/api/v1/sessions/{session_id}/patches/generate",
        {"expected_revision": analyzed["session"]["revision"]},
    )
    patch_generation_ms = elapsed(started)
    patch_id = generated["workflow"]["proposal"]["id"]
    started = time.perf_counter()
    approved = post(
        client,
        f"/api/v1/sessions/{session_id}/patches/{patch_id}/approve",
        {"expected_revision": generated["session"]["revision"]},
    )
    approval_and_validation_ms = elapsed(started)
    if approved["session"]["state"] != "SUCCESS":
        raise RuntimeError(f"{demo_id} repair did not pass real validation")
    apply_ms = approved["workflow"]["application"]["duration_ms"]
    validation_ms = approved["workflow"]["test_result"]["duration_ms"]
    started = time.perf_counter()
    rolled_back = post(
        client,
        f"/api/v1/sessions/{session_id}/patches/{patch_id}/rollback",
        {"expected_revision": approved["session"]["revision"]},
    )
    rollback_ms = elapsed(started)
    if rolled_back["session"]["state"] != "ROLLED_BACK":
        raise RuntimeError(f"{demo_id} rollback failed")
    restored = post(client, f"/api/v1/commands/{command_id}/run")
    if restored["status"] != "FAILED":
        raise RuntimeError(f"{demo_id} original failure was not restored")
    return {
        "demo_id": demo_id,
        "status": "PASS",
        "reset_ms": reset_ms,
        "workspace_selection_ms": select_ms,
        "initial_validation_ms": initial_validation_ms,
        "analysis_ms": analysis_ms,
        "patch_generation_ms": patch_generation_ms,
        "patch_application_ms": apply_ms,
        "validation_ms": validation_ms,
        "approval_and_validation_ms": approval_and_validation_ms,
        "rollback_ms": rollback_ms,
        "total_workflow_ms": elapsed(overall_started),
    }


def main() -> int:
    temporary_root = ROOT / ".pocketpilot" / "benchmarks" / str(uuid.uuid4())
    demo_root = temporary_root / "demo"
    try:
        shutil.copytree(ROOT / "demo", demo_root)
        app = create_app(
            Settings(
                demo_root_path=str(demo_root),
                session_database_path=str(temporary_root / "sessions.db"),
                llm_provider="mock",
                command_timeout_seconds=30,
            )
        )
        with TestClient(app) as client:
            results = [measure(client, *case) for case in CASES]
        print(json.dumps({"provider": "mock", "results": results}, indent=2))
        return 0
    finally:
        shutil.rmtree(temporary_root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
