"""Atomic, hash-guarded patch application and conflict-safe rollback."""

from __future__ import annotations

import hashlib
import os
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

from pocketpilot_agent.models import PatchProposal
from pocketpilot_agent.patch_store import RollbackFileSnapshot, RollbackSnapshot
from pocketpilot_agent.patch_validation import PatchValidator
from pocketpilot_agent.security import RepositorySecurityPolicy, WorkspaceSecurityError
from pocketpilot_agent.workspace import SelectedWorkspace


class StalePatchError(ValueError):
    pass


class PatchApplyError(RuntimeError):
    pass


class RollbackConflictError(ValueError):
    pass


class PatchEngine:
    def __init__(self, validator: PatchValidator) -> None:
        self.validator = validator
        self.policy = RepositorySecurityPolicy()

    def prepare(
        self,
        proposal: PatchProposal,
        selected: SelectedWorkspace,
        supplied_paths: set[str],
        applied_revision: int,
    ) -> tuple[dict[str, bytes], RollbackSnapshot, int]:
        started = time.perf_counter()
        validation, outputs = self.validator.validate(proposal, selected, supplied_paths)
        if not validation.valid:
            if any("Base hash" in error for error in validation.errors):
                raise StalePatchError("STALE_PATCH: a target changed after proposal creation.")
            raise PatchApplyError("Patch is no longer valid or applicable.")
        rendered: dict[str, bytes] = {}
        snapshots: list[RollbackFileSnapshot] = []
        for change in proposal.files:
            path = self._target(selected, change.relative_path)
            original = path.read_bytes()
            if hashlib.sha256(original).hexdigest() != change.original_sha256:
                raise StalePatchError("STALE_PATCH: a target changed after proposal creation.")
            patched = outputs[change.relative_path].encode("utf-8")
            rendered[change.relative_path] = patched
            snapshots.append(
                RollbackFileSnapshot(
                    relative_path=change.relative_path,
                    original_content=original.decode("utf-8"),
                    original_sha256=change.original_sha256,
                    patched_sha256=hashlib.sha256(patched).hexdigest(),
                )
            )
        snapshot = RollbackSnapshot(
            id=str(uuid.uuid4()),
            session_id=proposal.session_id,
            patch_id=proposal.id,
            files=snapshots,
            created_at=datetime.now(UTC),
            applied_revision=applied_revision,
        )
        return rendered, snapshot, self._elapsed(started)

    def apply(
        self,
        selected: SelectedWorkspace,
        rendered: dict[str, bytes],
        snapshot: RollbackSnapshot,
    ) -> int:
        started = time.perf_counter()
        replaced: list[RollbackFileSnapshot] = []
        try:
            for item in snapshot.files:
                target = self._target(selected, item.relative_path)
                current = target.read_bytes()
                if hashlib.sha256(current).hexdigest() != item.original_sha256:
                    raise StalePatchError(
                        "STALE_PATCH: a target changed during patch application."
                    )
                self._atomic_replace(target, rendered[item.relative_path])
                if hashlib.sha256(target.read_bytes()).hexdigest() != item.patched_sha256:
                    raise PatchApplyError("Patched content verification failed.")
                replaced.append(item)
        except Exception as exc:
            for item in reversed(replaced):
                target = self._target(selected, item.relative_path)
                self._atomic_replace(target, item.original_content.encode("utf-8"))
            if isinstance(exc, (PatchApplyError, StalePatchError)):
                raise
            raise PatchApplyError(
                "Atomic patch application failed; originals were restored."
            ) from exc
        return self._elapsed(started)

    def rollback(self, selected: SelectedWorkspace, snapshot: RollbackSnapshot) -> int:
        started = time.perf_counter()
        patched_contents: dict[str, bytes] = {}
        for item in snapshot.files:
            target = self._target(selected, item.relative_path)
            current = target.read_bytes()
            if hashlib.sha256(current).hexdigest() != item.patched_sha256:
                raise RollbackConflictError(
                    "ROLLBACK_CONFLICT: a patched file has newer developer changes."
                )
            patched_contents[item.relative_path] = current
        restored: list[RollbackFileSnapshot] = []
        try:
            for item in snapshot.files:
                target = self._target(selected, item.relative_path)
                self._atomic_replace(target, item.original_content.encode("utf-8"))
                restored.append(item)
        except Exception as exc:
            for item in reversed(restored):
                target = self._target(selected, item.relative_path)
                if hashlib.sha256(target.read_bytes()).hexdigest() == item.original_sha256:
                    self._atomic_replace(target, patched_contents[item.relative_path])
            raise PatchApplyError("Rollback failed and requires manual recovery.") from exc
        return self._elapsed(started)

    @staticmethod
    def _atomic_replace(target: Path, content: bytes) -> None:
        temporary = target.with_name(f".{target.name}.pocketpilot-{uuid.uuid4().hex}.tmp")
        try:
            with temporary.open("xb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, target)
        finally:
            if temporary.exists():
                temporary.unlink()

    def _target(self, selected: SelectedWorkspace, relative_path: str) -> Path:
        lexical = selected.resolver.root / relative_path
        if self.policy.is_reparse_point(lexical):
            raise WorkspaceSecurityError("Patch target is a link or reparse point.")
        return selected.resolver.resolve_relative(relative_path)

    @staticmethod
    def _elapsed(started: float) -> int:
        return max(0, round((time.perf_counter() - started) * 1000))
