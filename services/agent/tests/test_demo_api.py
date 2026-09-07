"""Registered demo safety, readiness, and deterministic repair-cycle tests."""

import json
import shutil
import uuid
from pathlib import Path

import anyio
import httpx
import pytest
from fastapi import FastAPI

from pocketpilot_agent.config import Settings
from pocketpilot_agent.main import create_app

REPOSITORY_ROOT = Path(__file__).parents[3]


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


@pytest.fixture
def demo_root(request: pytest.FixtureRequest) -> Path:
    target = REPOSITORY_ROOT / ".pocketpilot" / "test-demos" / str(uuid.uuid4()) / "demo"
    shutil.copytree(REPOSITORY_ROOT / "demo", target)
    request.addfinalizer(lambda: shutil.rmtree(target.parent, ignore_errors=True))
    return target


def app_for(tmp_path: Path, demo_root: Path) -> FastAPI:
    return create_app(
        Settings(
            session_database_path=str(tmp_path / "demo-tests.db"),
            demo_root_path=str(demo_root),
            llm_provider="mock",
            command_timeout_seconds=30,
        )
    )


def test_demo_health_and_preflight_report_actual_toolchains(
    tmp_path: Path, demo_root: Path
) -> None:
    app = app_for(tmp_path, demo_root)

    projects = anyio.run(request, app, "GET", "/api/v1/demo/projects").json()["demos"]
    anyio.run(request, app, "POST", "/api/v1/demo/select/python-null-user")
    preflight = anyio.run(request, app, "GET", "/api/v1/demo/preflight").json()
    by_id = {item["id"]: item for item in projects}

    assert by_id["python-null-user"]["status"] == "READY"
    assert by_id["react-null-profile"]["status"] == "READY"
    assert by_id["java-null-user"]["status"] in {"READY", "TOOL_MISSING"}
    assert preflight["overall"] in {"READY", "READY_WITH_TOOL_GAPS"}
    assert preflight["provider"] == "mock"
    assert preflight["model"] == "deterministic-root-cause-v1"


@pytest.mark.parametrize(
    "malicious_id",
    (
        "unknown-demo",
        "..",
        "C:%5CWindows",
        "%2e%2e%252foutside",
        "bad_id",
    ),
)
def test_demo_endpoints_reject_unregistered_and_path_like_ids(
    tmp_path: Path, demo_root: Path, malicious_id: str
) -> None:
    marker = tmp_path / "outside.txt"
    marker.write_text("preserve", encoding="utf-8")
    app = app_for(tmp_path, demo_root)

    response = anyio.run(
        request, app, "POST", f"/api/v1/demo/reset/{malicious_id}"
    )

    assert response.status_code in {404, 422}
    assert marker.read_text(encoding="utf-8") == "preserve"


def test_reset_restores_only_registered_source_and_reproduces_failure(
    tmp_path: Path, demo_root: Path
) -> None:
    app = app_for(tmp_path, demo_root)
    source = demo_root / "python-broken-app" / "user_service.py"
    unrelated = demo_root / "python-broken-app" / "notes.txt"
    source.write_text("def get_user_name(user):\n    return 'changed'\n", encoding="utf-8")
    unrelated.write_text("keep me", encoding="utf-8")

    response = anyio.run(
        request, app, "POST", "/api/v1/demo/reset/python-null-user"
    )

    assert response.status_code == 200, response.text
    assert response.json()["result"] == "DEMO_READY"
    assert "return user[\"name\"]" in source.read_text(encoding="utf-8")
    assert unrelated.read_text(encoding="utf-8") == "keep me"


def test_phone_safe_demo_selection_uses_server_registered_path(
    tmp_path: Path, demo_root: Path
) -> None:
    app = app_for(tmp_path, demo_root)

    selected = anyio.run(
        request, app, "POST", "/api/v1/demo/select/react-null-profile"
    )

    assert selected.status_code == 200, selected.text
    assert selected.json()["demo"]["name"] == "React User Profile"
    assert Path(selected.json()["workspace"]["root_path"]) == (
        demo_root / "react-broken-app"
    ).resolve()


def test_prepare_demo_resets_verifies_and_selects_registered_python(
    tmp_path: Path, demo_root: Path
) -> None:
    app = app_for(tmp_path, demo_root)
    source = demo_root / "python-broken-app" / "user_service.py"
    source.write_text("def get_user_name(user):\n    return 'already fixed'\n", encoding="utf-8")

    response = anyio.run(
        request, app, "POST", "/api/v1/demo/prepare/python-null-user"
    )

    assert response.status_code == 200, response.text
    prepared = response.json()
    assert prepared["result"] == "READY_FOR_NEXT_DEMO"
    assert prepared["demo"]["status"] == "READY"
    assert prepared["workspace"]["name"] == "python-broken-app"
    assert prepared["readiness"]["overall"] in {"READY", "READY_WITH_TOOL_GAPS"}
    assert 'return user["name"]' in source.read_text(encoding="utf-8")


def test_prepare_demo_rejects_path_like_identifier(
    tmp_path: Path, demo_root: Path
) -> None:
    app = app_for(tmp_path, demo_root)

    response = anyio.run(
        request, app, "POST", "/api/v1/demo/prepare/%2e%2e%252foutside"
    )

    assert response.status_code in {404, 422}


def test_java_mock_analysis_and_patch_are_available_without_maven(
    tmp_path: Path, demo_root: Path
) -> None:
    app = app_for(tmp_path, demo_root)
    anyio.run(request, app, "POST", "/api/v1/demo/select/java-null-user")
    created = anyio.run(
        request, app, "POST", "/api/v1/sessions", {"title": "Java repair"}
    ).json()
    session_id = created["session"]["id"]
    captured = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/transitions",
        {
            "target_state": "CAPTURED",
            "expected_revision": 0,
            "summary": "Captured Java failure.",
        },
    ).json()
    analyzed = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/analyze",
        {
            "input_type": "TEXT",
            "raw_text": (demo_root / "java-broken-app/fixtures/stacktrace.txt").read_text(
                encoding="utf-8"
            ),
            "expected_revision": captured["session"]["revision"],
        },
    ).json()

    generated = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/patches/generate",
        {"expected_revision": analyzed["session"]["revision"]},
    )

    assert generated.status_code == 200, generated.text
    workflow = generated.json()["workflow"]
    assert workflow["status"] == "AWAITING_APPROVAL"
    assert workflow["proposal"]["files"][0]["relative_path"].endswith(
        "UserService.java"
    )
    assert 'return "Unknown"' in workflow["proposal"]["files"][0]["unified_diff"]


def test_camera_compact_pytest_frame_resolves_context_and_generates_patch(
    tmp_path: Path, demo_root: Path
) -> None:
    app = app_for(tmp_path, demo_root)
    anyio.run(request, app, "POST", "/api/v1/demo/select/python-null-user")
    created = anyio.run(
        request, app, "POST", "/api/v1/sessions", {"title": "Camera OCR repair"}
    ).json()
    session_id = created["session"]["id"]
    captured = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/transitions",
        {
            "target_state": "CAPTURED",
            "expected_revision": 0,
            "summary": "Captured compact pytest output.",
        },
    ).json()
    analyzed = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/analyze",
        {
            "input_type": "CAMERA",
            "raw_text": (
                "TypeError: 'NoneType' object is not subscriptable\n"
                "user_service.py:5: TypeError"
            ),
            "expected_revision": captured["session"]["revision"],
        },
    ).json()

    assert analyzed["analysis"]["parsed_error"]["language"] == "Python"
    assert analyzed["analysis"]["context_files"][0]["relative_path"] == "user_service.py"
    generated = anyio.run(
        request,
        app,
        "POST",
        f"/api/v1/sessions/{session_id}/patches/generate",
        {"expected_revision": analyzed["session"]["revision"]},
    )
    assert generated.status_code == 200, generated.text
    assert generated.json()["workflow"]["status"] == "AWAITING_APPROVAL"


@pytest.mark.parametrize(
    ("demo_id", "project_directory", "error_fixture", "cycles"),
    (
        ("python-null-user", "python-broken-app", "fixtures/traceback.txt", 3),
        pytest.param(
            "java-null-user",
            "java-broken-app",
            "fixtures/stacktrace.txt",
            2,
            marks=pytest.mark.skipif(
                shutil.which("mvn") is None,
                reason="Maven toolchain is not installed",
            ),
        ),
        ("react-null-profile", "react-broken-app", "fixtures/terminal.txt", 2),
    ),
)
def test_deterministic_repair_and_rollback_cycles(
    tmp_path: Path,
    demo_root: Path,
    demo_id: str,
    project_directory: str,
    error_fixture: str,
    cycles: int,
) -> None:
    app = app_for(tmp_path, demo_root)
    project = demo_root / project_directory
    metadata = json.loads(
        (project / "demo.json").read_text(encoding="utf-8")
    )
    source = project / metadata["expected_file"]
    original = (demo_root / "fixtures" / demo_id / metadata["expected_file"]).read_bytes()

    for index in range(cycles):
        reset = anyio.run(request, app, "POST", f"/api/v1/demo/reset/{demo_id}")
        assert reset.json()["result"] == "DEMO_READY"
        selected = anyio.run(
            request, app, "POST", f"/api/v1/demo/select/{demo_id}"
        ).json()
        command_id = next(
            item["id"]
            for item in selected["workspace"]["detected_commands"]
            if item["category"] == "test"
        )
        failing = anyio.run(
            request, app, "POST", f"/api/v1/commands/{command_id}/run"
        ).json()
        assert failing["status"] == "FAILED"

        created = anyio.run(
            request,
            app,
            "POST",
            "/api/v1/sessions",
            {"title": f"{demo_id} cycle {index + 1}"},
        ).json()
        session_id = created["session"]["id"]
        captured = anyio.run(
            request,
            app,
            "POST",
            f"/api/v1/sessions/{session_id}/transitions",
            {
                "target_state": "CAPTURED",
                "expected_revision": 0,
                "summary": "Captured real demo failure.",
            },
        ).json()
        error_text = (project / error_fixture).read_text(encoding="utf-8")
        analyzed = anyio.run(
            request,
            app,
            "POST",
            f"/api/v1/sessions/{session_id}/analyze",
            {
                "input_type": "TEXT",
                "raw_text": error_text,
                "expected_revision": captured["session"]["revision"],
            },
        ).json()
        generated = anyio.run(
            request,
            app,
            "POST",
            f"/api/v1/sessions/{session_id}/patches/generate",
            {"expected_revision": analyzed["session"]["revision"]},
        )
        assert generated.status_code == 200, generated.text
        patch = generated.json()
        approved = anyio.run(
            request,
            app,
            "POST",
            (
                f"/api/v1/sessions/{session_id}/patches/"
                f"{patch['workflow']['proposal']['id']}/approve"
            ),
            {"expected_revision": patch["session"]["revision"]},
        )
        assert approved.status_code == 200, approved.text
        verified = approved.json()
        assert verified["session"]["state"] == "SUCCESS"
        assert verified["workflow"]["test_result"]["passed"] is True

        rolled_back = anyio.run(
            request,
            app,
            "POST",
            (
                f"/api/v1/sessions/{session_id}/patches/"
                f"{patch['workflow']['proposal']['id']}/rollback"
            ),
            {"expected_revision": verified["session"]["revision"]},
        )
        assert rolled_back.status_code == 200, rolled_back.text
        assert source.read_bytes() == original
        failed_again = anyio.run(
            request, app, "POST", f"/api/v1/commands/{command_id}/run"
        ).json()
        assert failed_again["status"] == "FAILED"
