import asyncio
import json
import shutil
from pathlib import Path

import anyio
import httpx
from fastapi import FastAPI

from pocketpilot_agent.config import Settings
from pocketpilot_agent.main import create_app
from pocketpilot_agent.patch_provider import MockPatchProvider


def app_for(tmp_path: Path) -> FastAPI:
    return create_app(
        Settings(
            session_database_path=str(tmp_path / "workflow.db"),
            llm_provider="mock",
            command_timeout_seconds=30,
        )
    )


async def request(
    app: FastAPI, method: str, path: str, payload: dict[str, object] | None = None
) -> httpx.Response:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.request(method, path, json=payload)


def copy_demo(tmp_path: Path) -> Path:
    source = Path(__file__).parents[3] / "demo" / "python-broken-app"
    target = tmp_path / "python-broken-app"
    shutil.copytree(source, target)
    return target


def start_through_analysis(app: FastAPI, root: Path) -> tuple[str, dict[str, object]]:
    inspected = anyio.run(
        request, app, "POST", "/api/v1/workspaces/inspect", {"root_path": str(root)}
    ).json()
    created = anyio.run(request, app, "POST", "/api/v1/sessions", {"title": "Repair"}).json()
    session_id = created["session"]["id"]
    captured = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/transitions",
        {"target_state": "CAPTURED", "expected_revision": 0, "summary": "Captured."},
    ).json()
    trace = (root / "fixtures" / "traceback.txt").read_text(encoding="utf-8")
    analyzed = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/analyze",
        {
            "input_type": "TEXT",
            "raw_text": trace,
            "expected_revision": captured["session"]["revision"],
        },
    ).json()
    assert inspected["detected_commands"]
    return session_id, analyzed


def generate(
    app: FastAPI,
    session_id: str,
    revision: int,
    action_source: str = "MOBILE_UI",
) -> dict[str, object]:
    response = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/patches/generate",
        {"expected_revision": revision, "action_source": action_source},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_real_end_to_end_apply_persist_and_rollback(tmp_path: Path) -> None:
    root = copy_demo(tmp_path)
    app = app_for(tmp_path)
    workspace = anyio.run(
        request, app, "POST", "/api/v1/workspaces/inspect", {"root_path": str(root)}
    ).json()
    command_id = next(
        item["id"] for item in workspace["detected_commands"] if item["category"] == "test"
    )
    before_test = anyio.run(
        request, app, "POST", f"/api/v1/commands/{command_id}/run"
    ).json()
    assert before_test["status"] == "FAILED"
    original = (root / "user_service.py").read_bytes()

    session_id, analyzed = start_through_analysis(app, root)
    generated = generate(
        app, session_id, analyzed["session"]["revision"], action_source="VOICE"
    )
    workflow = generated["workflow"]
    assert generated["session"]["state"] == "AWAITING_APPROVAL"
    assert (root / "user_service.py").read_bytes() == original
    patch_id = workflow["proposal"]["id"]
    approved = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/patches/{patch_id}/approve",
        {
            "expected_revision": generated["session"]["revision"],
            "action_source": "VOICE",
        },
    )
    assert approved.status_code == 200, approved.text
    applied = approved.json()
    assert applied["session"]["state"] == "SUCCESS"
    assert applied["workflow"]["test_result"]["passed"] is True
    assert b'return "Unknown"' in (root / "user_service.py").read_bytes()

    restarted = app_for(tmp_path)
    anyio.run(
        request,
        restarted,
        "POST",
        "/api/v1/workspaces/inspect",
        {"root_path": str(root)},
    )
    recovered = anyio.run(
        request,
        restarted,
        "GET",
        f"/api/v1/sessions/{session_id}/patches/current",
    ).json()
    assert recovered["status"] == "VERIFIED"
    assert recovered["rollback_status"] == "AVAILABLE"
    rolled_back = anyio.run(
        request,
        restarted,
        "POST",
        f"/api/v1/sessions/{session_id}/patches/{patch_id}/rollback",
        {
            "expected_revision": applied["session"]["revision"],
            "action_source": "VOICE",
        },
    )
    assert rolled_back.status_code == 200, rolled_back.text
    assert rolled_back.json()["session"]["state"] == "ROLLED_BACK"
    assert (root / "user_service.py").read_bytes() == original
    events = anyio.run(
        request, restarted, "GET", f"/api/v1/sessions/{session_id}/events"
    ).json()["events"]
    names = [event["name"] for event in events]
    for expected in (
        "patch_generation_started",
        "patch_validation_completed",
        "patch_awaiting_approval",
        "patch_approved",
        "patch_apply_started",
        "patch_file_applied",
        "patch_applied",
        "tests_started",
        "tests_passed",
        "rollback_started",
        "rollback_completed",
    ):
        assert expected in names
    assert [event["sequence"] for event in events] == list(
        range(1, len(events) + 1)
    )
    voice_summaries = [
        event["summary"] for event in events if "confirmed voice action" in event["summary"]
    ]
    assert len(voice_summaries) >= 3


def test_stale_patch_and_rollback_conflict_preserve_manual_edits(tmp_path: Path) -> None:
    root = copy_demo(tmp_path)
    app = app_for(tmp_path)
    session_id, analyzed = start_through_analysis(app, root)
    generated = generate(app, session_id, analyzed["session"]["revision"])
    patch_id = generated["workflow"]["proposal"]["id"]
    target = root / "user_service.py"
    target.write_text(target.read_text(encoding="utf-8") + "\n# developer edit\n", encoding="utf-8")

    stale = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/patches/{patch_id}/approve",
        {"expected_revision": generated["session"]["revision"]},
    )

    assert stale.status_code == 409
    assert "developer edit" in target.read_text(encoding="utf-8")
    current = anyio.run(
        request, app, "GET", f"/api/v1/sessions/{session_id}/patches/current"
    ).json()
    assert current["status"] == "FAILED"


def test_rejection_never_modifies_and_cannot_be_approved(tmp_path: Path) -> None:
    root = copy_demo(tmp_path)
    app = app_for(tmp_path)
    original = (root / "user_service.py").read_bytes()
    session_id, analyzed = start_through_analysis(app, root)
    generated = generate(app, session_id, analyzed["session"]["revision"])
    patch_id = generated["workflow"]["proposal"]["id"]

    wrong = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/patches/wrong-id/approve",
        {"expected_revision": generated["session"]["revision"]},
    )

    rejected = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/patches/{patch_id}/reject",
        {"expected_revision": generated["session"]["revision"]},
    )
    approve_after = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/patches/{patch_id}/approve",
        {"expected_revision": rejected.json()["session"]["revision"]},
    )

    assert wrong.status_code == 409
    assert rejected.json()["workflow"]["status"] == "REJECTED"
    assert approve_after.status_code == 409
    assert (root / "user_service.py").read_bytes() == original


def test_rollback_conflict_does_not_overwrite_newer_work(tmp_path: Path) -> None:
    root = copy_demo(tmp_path)
    app = app_for(tmp_path)
    session_id, analyzed = start_through_analysis(app, root)
    generated = generate(app, session_id, analyzed["session"]["revision"])
    patch_id = generated["workflow"]["proposal"]["id"]
    approved = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/patches/{patch_id}/approve",
        {"expected_revision": generated["session"]["revision"]},
    ).json()
    target = root / "user_service.py"
    target.write_text(
        target.read_text(encoding="utf-8") + "\n# work after PocketPilot\n",
        encoding="utf-8",
    )

    rollback = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/patches/{patch_id}/rollback",
        {"expected_revision": approved["session"]["revision"]},
    )

    assert rollback.status_code == 409
    assert "work after PocketPilot" in target.read_text(encoding="utf-8")
    current = anyio.run(
        request, app, "GET", f"/api/v1/sessions/{session_id}/patches/current"
    ).json()
    assert current["rollback_status"] == "CONFLICT"


def test_patch_provider_invalid_unknown_and_timeout_fail_safely(tmp_path: Path) -> None:
    responses = [
        (MockPatchProvider(response="not-json"), 422),
        (
            MockPatchProvider(
                response=json.dumps(
                    {
                        "title": "Invented file",
                        "summary": "Invalid",
                        "rationale": "Invalid",
                        "confidence": "HIGH",
                        "files": [
                            {
                                "relative_path": "invented.py",
                                "unified_diff": (
                                    "--- a/invented.py\n+++ b/invented.py\n"
                                    "@@ -1 +1 @@\n-x\n+y\n"
                                ),
                                "explanation": "Invalid",
                            }
                        ],
                        "expected_effect": "Invalid",
                        "risks": [],
                        "validation_notes": [],
                    }
                )
            ),
            422,
        ),
        (MockPatchProvider(delay_seconds=0.05), 504),
    ]
    for index, (provider, expected_status) in enumerate(responses):
        case_root = tmp_path / f"case-{index}"
        case_root.mkdir()
        root = copy_demo(case_root)
        app = create_app(
            Settings(
                session_database_path=str(case_root / "workflow.db"),
                llm_provider="mock",
                ollama_timeout_seconds=0.01,
            )
        )
        app.state.patch_service.provider = provider
        original = (root / "user_service.py").read_bytes()
        session_id, analyzed = start_through_analysis(app, root)
        response = anyio.run(
            request,
            app,
            "POST",
            f"/api/v1/sessions/{session_id}/patches/generate",
            {"expected_revision": analyzed["session"]["revision"]},
        )

        assert response.status_code == expected_status
        session = anyio.run(
            request, app, "GET", f"/api/v1/sessions/{session_id}"
        ).json()
        assert session["state"] == "FAILED"
        assert (root / "user_service.py").read_bytes() == original


def test_concurrent_generation_and_double_approval_are_rejected(tmp_path: Path) -> None:
    root = copy_demo(tmp_path)
    app = app_for(tmp_path)
    session_id, analyzed = start_through_analysis(app, root)
    app.state.patch_service.provider = MockPatchProvider(delay_seconds=0.05)

    async def race_generate() -> list[httpx.Response]:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            payload = {"expected_revision": analyzed["session"]["revision"]}
            return list(
                await asyncio.gather(
                    client.post(
                        f"/api/v1/sessions/{session_id}/patches/generate", json=payload
                    ),
                    client.post(
                        f"/api/v1/sessions/{session_id}/patches/generate", json=payload
                    ),
                )
            )

    generated_responses = anyio.run(race_generate)
    assert sorted(item.status_code for item in generated_responses) == [200, 409]
    generated = next(item.json() for item in generated_responses if item.status_code == 200)
    patch_id = generated["workflow"]["proposal"]["id"]

    async def race_approve() -> list[httpx.Response]:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            payload = {"expected_revision": generated["session"]["revision"]}
            return list(
                await asyncio.gather(
                    client.post(
                        f"/api/v1/sessions/{session_id}/patches/{patch_id}/approve",
                        json=payload,
                    ),
                    client.post(
                        f"/api/v1/sessions/{session_id}/patches/{patch_id}/approve",
                        json=payload,
                    ),
                )
            )

    approval_responses = anyio.run(race_approve)
    assert sorted(item.status_code for item in approval_responses) == [200, 409]
