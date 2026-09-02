import hashlib
from datetime import UTC, datetime
from pathlib import Path

from pocketpilot_agent.config import Settings
from pocketpilot_agent.models import (
    AnalysisConfidence,
    PatchFileChange,
    PatchProposal,
)
from pocketpilot_agent.patch_validation import PatchValidator
from pocketpilot_agent.unified_diff import UnifiedDiffParser
from pocketpilot_agent.workspace import SelectedWorkspace, WorkspaceService


def proposal(path: str, diff: str, original: bytes) -> PatchProposal:
    parsed = UnifiedDiffParser().parse(diff)
    return PatchProposal(
        id="patch-1",
        session_id="session-1",
        title="Fixture patch",
        summary="Fixture patch",
        rationale="Fixture validation",
        confidence=AnalysisConfidence.HIGH,
        files=[
            PatchFileChange(
                relative_path=path,
                unified_diff=diff,
                explanation="Fixture change",
                original_sha256=hashlib.sha256(original).hexdigest(),
                additions=parsed.additions,
                deletions=parsed.deletions,
            )
        ],
        expected_effect="Fixture behavior changes.",
        risks=[],
        validation_notes=[],
        created_at=datetime.now(UTC),
        provider="mock",
        model="mock",
        retry_number=0,
        generation_duration_ms=1,
    )


def validator() -> PatchValidator:
    return PatchValidator(max_files=5, max_additions=100, max_change_ratio=0.8)


def selected(root: Path) -> SelectedWorkspace:
    workspace = WorkspaceService(Settings())
    workspace.inspect(str(root))
    return workspace.selected_for_analysis()


def test_wrong_base_hash_and_unknown_file_are_rejected(python_project: Path) -> None:
    path = "src/main.py"
    original = (python_project / path).read_bytes()
    diff = (
        "--- a/src/main.py\n+++ b/src/main.py\n@@ -1 +1,2 @@\n"
        " from fastapi import FastAPI\n+SAFE = True\n"
    )
    item = proposal(path, diff, original).model_copy(
        update={
            "files": [
                proposal(path, diff, original).files[0].model_copy(
                    update={"original_sha256": "0" * 64}
                )
            ]
        }
    )

    result, _ = validator().validate(item, selected(python_project), {path})
    unknown, _ = validator().validate(
        proposal(path, diff, original), selected(python_project), {"other.py"}
    )

    assert result.valid is False
    assert any("Base hash" in error for error in result.errors)
    assert unknown.valid is False
    assert unknown.risk == "BLOCKED"


def test_sensitive_lockfile_and_shell_execution_are_blocked(python_project: Path) -> None:
    path = "src/main.py"
    original = (python_project / path).read_bytes()
    diff = (
        "--- a/src/main.py\n+++ b/src/main.py\n@@ -1 +1,2 @@\n"
        " from fastapi import FastAPI\n+import os; os.system('rm -rf /')\n"
    )

    result, _ = validator().validate(
        proposal(path, diff, original), selected(python_project), {path}
    )

    assert result.valid is False
    assert result.risk == "BLOCKED"
    assert any("execution behavior" in error for error in result.errors)
