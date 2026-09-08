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


class SequencePatchProvider:
    name = "test-sequence"
    model = "test-sequence-v1"

    def __init__(
        self, responses: list[str], delays: list[float] | None = None
    ) -> None:
        self.responses = responses
        self.delays = delays or []
        self.call_count = 0

    async def generate(self, prompt: object, files: object) -> str:
        del prompt, files
        index = min(self.call_count, len(self.responses) - 1)
        delay = self.delays[index] if index < len(self.delays) else 0
        if delay:
            await asyncio.sleep(delay)
        response = self.responses[index]
        self.call_count += 1
        return response


def patch_response(diff: str, path: str = "user_service.py") -> str:
    return json.dumps(
        {
            "title": "Handle missing user",
            "summary": "Return the documented fallback.",
            "rationale": "The input may be None.",
            "confidence": "HIGH",
            "files": [
                {
                    "relative_path": path,
                    "unified_diff": diff,
                    "explanation": "Guard the missing value.",
                }
            ],
            "expected_effect": "The missing-user test passes.",
            "risks": ["Only the missing-user branch changes."],
            "validation_notes": ["Run the registered tests."],
        }
    )


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


def test_malformed_diff_receives_one_repair_then_full_validation(tmp_path: Path) -> None:
    root = copy_demo(tmp_path)
    app = app_for(tmp_path)
    invalid_counts = (
        "--- a/user_service.py\n"
        "+++ b/user_service.py\n"
        "@@ -3,4 +3,5 @@\n"
        " def get_user_name(user: dict[str, str] | None) -> str:\n"
        '     """Return the display name for a repository result."""\n'
        "+    if user is None:\n"
        '+        return "Unknown"\n'
        '     return user["name"]\n'
    )
    valid = invalid_counts.replace("@@ -3,4 +3,5 @@", "@@ -3,3 +3,5 @@")
    provider = SequencePatchProvider(
        [patch_response(invalid_counts), patch_response(valid)]
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

    assert response.status_code == 200
    assert provider.call_count == 2
    assert response.json()["workflow"]["validation"]["valid"] is True
    assert (root / "user_service.py").read_bytes() == original


def test_valid_diff_does_not_use_repair(tmp_path: Path) -> None:
    root = copy_demo(tmp_path)
    app = app_for(tmp_path)
    valid = (
        "--- a/user_service.py\n"
        "+++ b/user_service.py\n"
        "@@ -3,3 +3,5 @@\n"
        " def get_user_name(user: dict[str, str] | None) -> str:\n"
        '     \"\"\"Return the display name for a repository result.\"\"\"\n'
        "+    if user is None:\n"
        '+        return "Unknown"\n'
        '     return user["name"]\n'
    )
    provider = SequencePatchProvider([patch_response(valid)])
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

    assert response.status_code == 200
    assert provider.call_count == 1
    assert (root / "user_service.py").read_bytes() == original


def test_validator_scores_actual_change_instead_of_no_op_diff_churn(
    tmp_path: Path,
) -> None:
    root = copy_demo(tmp_path)
    app = app_for(tmp_path)
    churned_but_small = (
        "--- a/user_service.py\n"
        "+++ b/user_service.py\n"
        "@@ -1,5 +1,5 @@\n"
        ' \"\"\"User-name behavior for the deterministic repair demonstration.\"\"\"\n'
        " \n"
        " def get_user_name(user: dict[str, str] | None) -> str:\n"
        '-    \"\"\"Return the display name for a repository result.\"\"\"\n'
        '-    return user["name"]\n'
        '+    \"\"\"Return the display name for a repository result.\"\"\"\n'
        '+    return user["name"] if user is not None else "Unknown"\n'
    )
    provider = SequencePatchProvider([patch_response(churned_but_small)])
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

    assert response.status_code == 200
    assert provider.call_count == 1
    validation = response.json()["workflow"]["validation"]
    assert validation["additions"] == 1
    assert validation["deletions"] == 1
    assert validation["risk"] == "MEDIUM"
    assert (root / "user_service.py").read_bytes() == original


def test_malformed_diff_gets_only_one_repair_attempt(tmp_path: Path) -> None:
    root = copy_demo(tmp_path)
    app = app_for(tmp_path)
    malformed = patch_response(
        "--- a/user_service.py\n+++ b/user_service.py\n@@ -3,99 +3,99 @@\n broken\n"
    )
    provider = SequencePatchProvider([malformed, malformed, malformed])
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

    assert response.status_code == 422
    assert provider.call_count == 2
    assert (root / "user_service.py").read_bytes() == original


def test_header_path_mismatch_is_repaired_before_validation(tmp_path: Path) -> None:
    root = copy_demo(tmp_path)
    app = app_for(tmp_path)
    body = (
        "@@ -3,3 +3,5 @@\n"
        " def get_user_name(user: dict[str, str] | None) -> str:\n"
        '     \"\"\"Return the display name for a repository result.\"\"\"\n'
        "+    if user is None:\n"
        '+        return "Unknown"\n'
        '     return user["name"]\n'
    )
    mismatch = patch_response("--- a/other.py\n+++ b/other.py\n" + body)
    valid = patch_response("--- a/user_service.py\n+++ b/user_service.py\n" + body)
    provider = SequencePatchProvider([mismatch, valid])
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

    assert response.status_code == 200
    assert provider.call_count == 2
    assert (root / "user_service.py").read_bytes() == original


def test_invalid_provider_shape_is_bounded_to_one_repair(tmp_path: Path) -> None:
    root = copy_demo(tmp_path)
    app = app_for(tmp_path)
    invalid_shape = json.loads(patch_response("unused"))
    invalid_shape["title"] = ""
    malformed = json.dumps(invalid_shape)
    provider = SequencePatchProvider([malformed, malformed, malformed])
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

    assert response.status_code == 422
    assert provider.call_count == 2
    assert (root / "user_service.py").read_bytes() == original


def test_patch_repair_timeout_returns_504_without_writes(tmp_path: Path) -> None:
    root = copy_demo(tmp_path)
    app = create_app(
        Settings(
            session_database_path=str(tmp_path / "workflow.db"),
            llm_provider="mock",
            ollama_timeout_seconds=0.01,
        )
    )
    malformed = patch_response(
        "--- a/user_service.py\n+++ b/user_service.py\n@@ -3,99 +3,99 @@\n broken\n"
    )
    provider = SequencePatchProvider([malformed, malformed], delays=[0, 0.05])
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

    assert response.status_code == 504
    assert provider.call_count == 1
    assert (root / "user_service.py").read_bytes() == original


def test_repaired_diff_failing_deterministic_validation_gets_no_third_call(
    tmp_path: Path,
) -> None:
    root = copy_demo(tmp_path)
    app = app_for(tmp_path)
    context_mismatch = patch_response(
        "--- a/user_service.py\n"
        "+++ b/user_service.py\n"
        "@@ -3,1 +3,1 @@\n"
        "-this line is not in the source\n"
        "+replacement\n"
    )
    provider = SequencePatchProvider(
        [context_mismatch, context_mismatch, context_mismatch]
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

    assert response.status_code == 422
    assert provider.call_count == 2
    assert (root / "user_service.py").read_bytes() == original


def test_unsupplied_file_is_not_sent_to_model_repair(tmp_path: Path) -> None:
    root = copy_demo(tmp_path)
    app = app_for(tmp_path)
    unknown = patch_response(
        "--- a/invented.py\n+++ b/invented.py\n@@ -1 +1 @@\n-old\n+new\n",
        "invented.py",
    )
    provider = SequencePatchProvider([unknown, patch_response("unused")])
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

    assert response.status_code == 422
    assert provider.call_count == 1
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
