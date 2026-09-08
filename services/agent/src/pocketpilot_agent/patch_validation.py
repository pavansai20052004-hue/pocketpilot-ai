"""Deterministic validation and risk classification for untrusted patch proposals."""

from __future__ import annotations

import hashlib
import time
from difflib import SequenceMatcher
from pathlib import Path

from pocketpilot_agent.models import (
    FileCategory,
    PatchProposal,
    PatchRisk,
    PatchValidationResult,
)
from pocketpilot_agent.security import RepositorySecurityPolicy, WorkspaceSecurityError
from pocketpilot_agent.unified_diff import UnifiedDiffError, UnifiedDiffParser
from pocketpilot_agent.workspace import SelectedWorkspace


class PatchValidator:
    suspicious_additions = (
        "shell=true",
        "os.system(",
        "subprocess.",
        "powershell",
        "rm -rf",
        "npm publish",
        "curl ",
        "eval(",
        "exec(",
    )
    lockfiles = frozenset(
        {"package-lock.json", "pnpm-lock.yaml", "yarn.lock", "poetry.lock", "uv.lock"}
    )

    def __init__(self, *, max_files: int, max_additions: int, max_change_ratio: float) -> None:
        self.max_files = max_files
        self.max_additions = max_additions
        self.max_change_ratio = max_change_ratio
        self.parser = UnifiedDiffParser()
        self.policy = RepositorySecurityPolicy()

    def validate(
        self,
        proposal: PatchProposal,
        selected: SelectedWorkspace,
        supplied_paths: set[str],
    ) -> tuple[PatchValidationResult, dict[str, str]]:
        started = time.perf_counter()
        errors: list[str] = []
        warnings: list[str] = []
        outputs: dict[str, str] = {}
        risk = PatchRisk.LOW
        indexed = {item.relative_path: item for item in selected.scan.files}
        if len(proposal.files) > self.max_files:
            errors.append("Patch changes too many files.")
            risk = PatchRisk.BLOCKED
        seen: set[str] = set()
        additions = 0
        deletions = 0
        for change in proposal.files:
            path = change.relative_path.replace("\\", "/")
            if path in seen:
                errors.append(f"Duplicate patch target: {path}.")
                risk = PatchRisk.BLOCKED
                continue
            seen.add(path)
            item = indexed.get(path)
            if path not in supplied_paths:
                errors.append(f"Patch target was not supplied to the provider: {path}.")
                risk = PatchRisk.BLOCKED
                continue
            if item is None or item.category in {
                FileCategory.EXCLUDED_SENSITIVE,
                FileCategory.GENERATED,
            }:
                errors.append(f"Patch target is not an eligible indexed source file: {path}.")
                risk = PatchRisk.BLOCKED
                continue
            if (
                self.policy.is_sensitive_file(Path(path).name)
                or Path(path).name.casefold() in self.lockfiles
            ):
                errors.append(f"Sensitive or lockfile target is blocked: {path}.")
                risk = PatchRisk.BLOCKED
                continue
            try:
                lexical = selected.resolver.root / Path(path)
                if self.policy.is_reparse_point(lexical):
                    raise WorkspaceSecurityError("Patch target is a link or reparse point.")
                resolved = selected.resolver.resolve_relative(path)
                if not resolved.is_file() or self.policy.is_reparse_point(resolved):
                    raise WorkspaceSecurityError("Patch target is not a regular workspace file.")
                original_bytes = resolved.read_bytes()
                original = original_bytes.decode("utf-8")
                digest = hashlib.sha256(original_bytes).hexdigest()
                if digest != change.original_sha256:
                    errors.append(f"Base hash does not match current content: {path}.")
                    continue
                parsed = self.parser.parse(change.unified_diff)
                if parsed.relative_path != path:
                    errors.append(f"Diff header does not match declared file: {path}.")
                    risk = PatchRisk.BLOCKED
                    continue
                if parsed.additions != change.additions or parsed.deletions != change.deletions:
                    errors.append(f"Declared diff counts are incorrect: {path}.")
                    continue
                output = self.parser.apply(parsed, original)
                outputs[path] = output
                semantic_additions, semantic_deletions = self._semantic_counts(
                    original, output
                )
                additions += semantic_additions
                deletions += semantic_deletions
                ratio = (semantic_additions + semantic_deletions) / max(
                    1, len(original.splitlines())
                )
                if ratio > self.max_change_ratio:
                    errors.append(f"Patch changes an excessive portion of {path}.")
                    risk = PatchRisk.HIGH
                elif ratio > 0.3 and risk is PatchRisk.LOW:
                    risk = PatchRisk.MEDIUM
                    warnings.append(f"Patch changes more than 30% of {path}.")
                added_text = "\n".join(
                    line[1:]
                    for line in change.unified_diff.splitlines()
                    if line.startswith("+") and not line.startswith("+++")
                ).casefold()
                if any(marker in added_text for marker in self.suspicious_additions):
                    errors.append(f"Patch introduces blocked execution behavior in {path}.")
                    risk = PatchRisk.BLOCKED
            except (OSError, UnicodeError, WorkspaceSecurityError, UnifiedDiffError) as exc:
                errors.append(f"{path}: {exc}")
        if additions > self.max_additions:
            errors.append("Patch adds too many lines.")
            risk = PatchRisk.HIGH
        valid = not errors and risk not in {PatchRisk.HIGH, PatchRisk.BLOCKED}
        return (
            PatchValidationResult(
                valid=valid,
                risk=risk,
                errors=errors,
                warnings=warnings,
                files_changed=len(outputs),
                additions=additions,
                deletions=deletions,
                duration_ms=max(0, round((time.perf_counter() - started) * 1000)),
            ),
            outputs,
        )

    @staticmethod
    def _semantic_counts(original: str, output: str) -> tuple[int, int]:
        additions = 0
        deletions = 0
        matcher = SequenceMatcher(
            None, original.splitlines(), output.splitlines(), autojunk=False
        )
        for tag, old_start, old_end, new_start, new_end in matcher.get_opcodes():
            if tag == "equal":
                continue
            deletions += old_end - old_start
            additions += new_end - new_start
        return additions, deletions
