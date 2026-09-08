"""Run genuine Ollama repair cycles in a disposable registered demo copy."""

from __future__ import annotations

import json
import os
import shutil
import sys
import time
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent" / "src"))

from pocketpilot_agent.config import Settings
from pocketpilot_agent.main import create_app


DEMOS = {
    "python-null-user": {
        "fixture": "fixtures/traceback.txt",
        "expected_file": "user_service.py",
        "concept_tokens": ("none", "null", "missing", "dereferenc", "subscript"),
    },
    "java-null-user": {
        "fixture": "fixtures/stacktrace.txt",
        "expected_file": "src/main/java/demo/UserService.java",
        "concept_tokens": ("null", "missing", "dereferenc", "nullpointer"),
    },
    "react-null-profile": {
        "fixture": "fixtures/terminal.txt",
        "expected_file": "src/UserProfile.tsx",
        "concept_tokens": ("null", "missing", "fallback", "render"),
    },
}


def elapsed_ms(started: float) -> int:
    return round((time.perf_counter() - started) * 1000)


def post(client: TestClient, path: str, payload: dict[str, object] | None = None):
    return client.post(path, json=payload)


def run_cycle(client: TestClient, demo_id: str, cycle: int) -> dict[str, object]:
    demo = DEMOS[demo_id]
    result: dict[str, object] = {
        "demo_id": demo_id,
        "cycle": cycle,
        "analysis": "FAIL",
        "root_cause_concept": "incorrect",
        "evidence": "FAIL",
        "patch_parse": "FAIL",
        "patch_validation": "FAIL",
        "real_tests": "FAIL",
        "rollback": "NOT_RUN",
        "complete_success": False,
    }
    overall_started = time.perf_counter()
    reset = post(client, f"/api/v1/demo/reset/{demo_id}")
    if reset.status_code != 200 or reset.json().get("result") != "DEMO_READY":
        result["failure_stage"] = "reset"
        result["workflow_ms"] = elapsed_ms(overall_started)
        return result

    selected = post(client, f"/api/v1/demo/select/{demo_id}")
    if selected.status_code != 200:
        result["failure_stage"] = "workspace_selection"
        result["workflow_ms"] = elapsed_ms(overall_started)
        return result
    selected_payload = selected.json()
    workspace = selected_payload["workspace"]
    root = Path(workspace["root_path"])
    command_id = next(
        command["id"]
        for command in workspace["detected_commands"]
        if command["category"] == "test"
    )
    failing = post(client, f"/api/v1/commands/{command_id}/run")
    if failing.status_code != 200 or failing.json().get("status") != "FAILED":
        result["failure_stage"] = "initial_failure"
        result["workflow_ms"] = elapsed_ms(overall_started)
        return result

    created = post(client, "/api/v1/sessions", {"title": f"Real Ollama {demo_id} cycle {cycle}"})
    session_id = created.json()["session"]["id"]
    captured = post(
        client,
        f"/api/v1/sessions/{session_id}/transitions",
        {
            "target_state": "CAPTURED",
            "expected_revision": 0,
            "summary": f"Real failing output captured for {demo_id} Ollama benchmark.",
        },
    )
    fixture = (root / str(demo["fixture"])).read_text(encoding="utf-8")
    analysis_started = time.perf_counter()
    analyzed = post(
        client,
        f"/api/v1/sessions/{session_id}/analyze",
        {
            "input_type": "TEXT",
            "raw_text": fixture,
            "expected_revision": captured.json()["session"]["revision"],
        },
    )
    result["analysis_request_ms"] = elapsed_ms(analysis_started)
    if analyzed.status_code != 200:
        result["failure_stage"] = "analysis"
        result["http_status"] = analyzed.status_code
        result["detail"] = analyzed.json().get("detail")
        result["workflow_ms"] = elapsed_ms(overall_started)
        return result

    analysis = analyzed.json()["analysis"]
    diagnosis = analysis["result"]
    result["analysis"] = "PASS"
    result["analysis_provider_ms"] = analysis["timings"]["provider_ms"]
    likely_file = diagnosis.get("likely_file") or ""
    result["likely_file"] = likely_file
    result["likely_line"] = diagnosis.get("likely_line")
    concept_text = " ".join(
        str(diagnosis.get(key) or "")
        for key in ("summary", "root_cause", "explanation", "repair_strategy")
    ).casefold()
    concept_correct = any(token in concept_text for token in demo["concept_tokens"])
    normalized_file = likely_file.replace("\\", "/")
    file_correct = normalized_file.endswith(str(demo["expected_file"]))
    result["root_cause_concept"] = "correct" if concept_correct and file_correct else "incorrect"
    evidence = diagnosis.get("evidence", [])
    evidence_valid = bool(evidence) and all(
        isinstance(item.get("relative_path"), str)
        and (root / item["relative_path"]).is_file()
        for item in evidence
    )
    result["evidence"] = "PASS" if evidence_valid else "FAIL"
    result["analysis_warnings"] = diagnosis.get("warnings", [])

    patch_started = time.perf_counter()
    generated = post(
        client,
        f"/api/v1/sessions/{session_id}/patches/generate",
        {"expected_revision": analyzed.json()["session"]["revision"]},
    )
    result["patch_request_ms"] = elapsed_ms(patch_started)
    if generated.status_code != 200:
        result["failure_stage"] = "patch_generation_or_validation"
        result["http_status"] = generated.status_code
        result["detail"] = generated.json().get("detail")
        result["workflow_ms"] = elapsed_ms(overall_started)
        return result

    workflow = generated.json()["workflow"]
    proposal = workflow["proposal"]
    result["patch_parse"] = "PASS"
    result["patch_validation"] = "PASS"
    result["patch_provider_ms"] = proposal["generation_duration_ms"]
    result["patch_files"] = [item["relative_path"] for item in proposal["files"]]
    patch_id = proposal["id"]
    approved = post(
        client,
        f"/api/v1/sessions/{session_id}/patches/{patch_id}/approve",
        {"expected_revision": generated.json()["session"]["revision"]},
    )
    if approved.status_code != 200:
        result["failure_stage"] = "approval"
        result["http_status"] = approved.status_code
        result["detail"] = approved.json().get("detail")
        result["workflow_ms"] = elapsed_ms(overall_started)
        return result

    approved_payload = approved.json()
    passed = (
        approved_payload["session"]["state"] == "SUCCESS"
        and approved_payload["workflow"]["test_result"]["passed"] is True
    )
    result["real_tests"] = "PASS" if passed else "FAIL"
    result["test_duration_ms"] = approved_payload["workflow"]["test_result"]["duration_ms"]
    rollback = post(
        client,
        f"/api/v1/sessions/{session_id}/patches/{patch_id}/rollback",
        {"expected_revision": approved_payload["session"]["revision"]},
    )
    result["rollback"] = (
        "PASS"
        if rollback.status_code == 200 and rollback.json()["session"]["state"] == "ROLLED_BACK"
        else "FAIL"
    )
    restored = post(client, f"/api/v1/commands/{command_id}/run")
    result["failure_restored"] = (
        restored.status_code == 200 and restored.json().get("status") == "FAILED"
    )
    result["complete_success"] = all(
        (
            result["analysis"] == "PASS",
            result["root_cause_concept"] == "correct",
            result["evidence"] == "PASS",
            result["patch_parse"] == "PASS",
            result["patch_validation"] == "PASS",
            result["real_tests"] == "PASS",
            result["rollback"] == "PASS",
            result["failure_restored"] is True,
        )
    )
    result["workflow_ms"] = elapsed_ms(overall_started)
    return result


def main() -> int:
    model = os.environ.get("POCKETPILOT_OLLAMA_MODEL", "qwen3-coder:30b").strip()
    demo_id = os.environ.get("POCKETPILOT_OLLAMA_DEMO_ID", "python-null-user").strip()
    if demo_id not in DEMOS:
        raise ValueError(f"Unsupported POCKETPILOT_OLLAMA_DEMO_ID: {demo_id}")
    cycles = int(os.environ.get("POCKETPILOT_OLLAMA_BENCHMARK_CYCLES", "5"))
    if cycles < 1 or cycles > 20:
        raise ValueError("POCKETPILOT_OLLAMA_BENCHMARK_CYCLES must be between 1 and 20.")
    temporary_root = ROOT / ".pocketpilot" / "benchmarks" / str(uuid.uuid4())
    demo_root = temporary_root / "demo"
    try:
        shutil.copytree(ROOT / "demo", demo_root)
        settings = Settings(
            demo_root_path=str(demo_root),
            session_database_path=str(temporary_root / "sessions.db"),
            llm_provider="ollama",
            ollama_model=model,
            ollama_timeout_seconds=float(
                os.environ.get("POCKETPILOT_OLLAMA_TIMEOUT_SECONDS", "300")
            ),
            ollama_context_tokens=int(
                os.environ.get("POCKETPILOT_OLLAMA_CONTEXT_TOKENS", "8192")
            ),
            ollama_max_output_tokens=int(
                os.environ.get("POCKETPILOT_OLLAMA_MAX_OUTPUT_TOKENS", "2048")
            ),
            command_timeout_seconds=60,
        )
        app = create_app(settings)
        with TestClient(app) as client:
            health = client.get("/api/v1/analysis/provider").json()
            if not health.get("available"):
                print(json.dumps({"provider": health, "error": "Ollama is not ready."}, indent=2))
                return 2
            results = [run_cycle(client, demo_id, cycle) for cycle in range(1, cycles + 1)]
        passed = sum(item["complete_success"] is True for item in results)
        required = 4 if cycles == 5 else cycles
        payload = {
            "provider": "ollama",
            "model": model,
            "demo_id": demo_id,
            "threshold": "PRIMARY" if passed >= required else "EXPERIMENTAL",
            "passed": passed,
            "total": len(results),
            "results": results,
        }
        print(json.dumps(payload, indent=2))
        return 0 if passed >= required else 1
    finally:
        shutil.rmtree(temporary_root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
