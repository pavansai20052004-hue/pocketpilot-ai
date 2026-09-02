import hashlib
import os
from datetime import UTC, datetime
from pathlib import Path

import pytest

from pocketpilot_agent.config import Settings
from pocketpilot_agent.models import (
    AnalysisConfidence,
    PatchFileChange,
    PatchProposal,
)
from pocketpilot_agent.patch_engine import PatchApplyError, PatchEngine
from pocketpilot_agent.patch_validation import PatchValidator
from pocketpilot_agent.unified_diff import UnifiedDiffParser
from pocketpilot_agent.workspace import WorkspaceService


def test_multi_file_write_failure_restores_already_replaced_files(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    (tmp_path / "pyproject.toml").write_text(
        '[project]\nname="fixture"\nversion="1"\n', encoding="utf-8"
    )
    originals = {"a.py": b"VALUE = 1\n", "b.py": b"VALUE = 2\n"}
    for name, content in originals.items():
        (tmp_path / name).write_bytes(content)
    workspace = WorkspaceService(Settings())
    workspace.inspect(str(tmp_path))
    parser = UnifiedDiffParser()
    changes = []
    for name, old, new in (("a.py", "1", "10"), ("b.py", "2", "20")):
        diff = f"--- a/{name}\n+++ b/{name}\n@@ -1 +1 @@\n-VALUE = {old}\n+VALUE = {new}\n"
        parsed = parser.parse(diff)
        changes.append(
            PatchFileChange(
                relative_path=name,
                unified_diff=diff,
                explanation="Fixture",
                original_sha256=hashlib.sha256(originals[name]).hexdigest(),
                additions=parsed.additions,
                deletions=parsed.deletions,
            )
        )
    proposal = PatchProposal(
        id="patch",
        session_id="session",
        title="Atomic fixture",
        summary="Atomic fixture",
        rationale="Atomic fixture",
        confidence=AnalysisConfidence.HIGH,
        files=changes,
        expected_effect="Both values change.",
        risks=[],
        validation_notes=[],
        created_at=datetime.now(UTC),
        provider="mock",
        model="mock",
        retry_number=0,
        generation_duration_ms=0,
    )
    validator = PatchValidator(max_files=5, max_additions=100, max_change_ratio=2)
    engine = PatchEngine(validator)
    selected = workspace.selected_for_analysis()
    rendered, snapshot, _ = engine.prepare(
        proposal, selected, set(originals), applied_revision=1
    )
    real_replace = os.replace
    failed = False

    def fail_second(source: str | Path, target: str | Path) -> None:
        nonlocal failed
        if Path(target).name == "b.py" and not failed:
            failed = True
            raise OSError("simulated replace failure")
        real_replace(source, target)

    monkeypatch.setattr(os, "replace", fail_second)

    with pytest.raises(PatchApplyError):
        engine.apply(selected, rendered, snapshot)

    assert {name: (tmp_path / name).read_bytes() for name in originals} == originals

    engine.apply(selected, rendered, snapshot)
    assert (tmp_path / "a.py").read_text(encoding="utf-8") == "VALUE = 10\n"
    assert (tmp_path / "b.py").read_text(encoding="utf-8") == "VALUE = 20\n"
    engine.rollback(selected, snapshot)
    assert {name: (tmp_path / name).read_bytes() for name in originals} == originals
