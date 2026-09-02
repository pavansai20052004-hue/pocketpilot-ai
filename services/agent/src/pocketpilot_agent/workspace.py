"""Application service coordinating one explicitly selected workspace."""

from __future__ import annotations

import hashlib
import threading
from dataclasses import dataclass

from pocketpilot_agent.commands import SafeCommandRegistry
from pocketpilot_agent.config import Settings
from pocketpilot_agent.detector import ProjectDetector
from pocketpilot_agent.models import CommandRun, RepositoryFileIndex, SafeCommandList, WorkspaceInfo
from pocketpilot_agent.runner import SafeProcessRunner
from pocketpilot_agent.scanner import RepositoryScan, RepositoryScanner, ScanLimits
from pocketpilot_agent.security import SafePathResolver


class NoWorkspaceSelectedError(LookupError):
    """Raised when an operation requires a selected workspace."""


class CommandRunNotFoundError(LookupError):
    """Raised when a command run identifier is unknown."""


@dataclass(frozen=True, slots=True)
class SelectedWorkspace:
    resolver: SafePathResolver
    info: WorkspaceInfo
    scan: RepositoryScan
    registry: SafeCommandRegistry


class WorkspaceService:
    """Own current workspace state, its allowlist, and local command history."""

    def __init__(self, settings: Settings) -> None:
        self._scanner = RepositoryScanner(
            ScanLimits(
                max_files=settings.max_files,
                max_file_size=settings.max_file_size,
                max_repository_scan_size=settings.max_repository_scan_size,
            )
        )
        self._max_manifest_size = min(settings.max_file_size, 262_144)
        self._runner = SafeProcessRunner(
            timeout_seconds=settings.command_timeout_seconds,
            max_output_bytes=settings.max_command_output_bytes,
        )
        self._current: SelectedWorkspace | None = None
        self._runs: dict[str, CommandRun] = {}
        self._lock = threading.RLock()

    def inspect(self, raw_root: str) -> WorkspaceInfo:
        resolver = SafePathResolver.select_workspace(raw_root)
        scan = self._scanner.scan(resolver)
        detector = ProjectDetector(
            resolver=resolver,
            files=scan.files,
            max_manifest_size=self._max_manifest_size,
        )
        projects, frameworks, build_systems, package_managers = detector.detect()
        registry = SafeCommandRegistry.detect(resolver, scan.files, detector)
        digest = hashlib.sha256(str(resolver.root).encode("utf-8")).hexdigest()[:16]
        info = WorkspaceInfo(
            id=f"workspace-{digest}",
            root_path=str(resolver.root),
            name=resolver.root.name,
            exists=True,
            readable=True,
            project_types=list(projects),
            languages=list(scan.languages),
            frameworks=list(frameworks),
            build_systems=list(build_systems),
            package_managers=list(package_managers),
            file_count=scan.file_count,
            relevant_file_count=scan.relevant_file_count,
            total_size=scan.total_size,
            git_detected=scan.git_detected,
            git_branch=scan.git_branch,
            detected_commands=list(registry.list()),
            scan_truncated=scan.scan_truncated,
            scan_duration_ms=scan.scan_duration_ms,
        )
        with self._lock:
            self._current = SelectedWorkspace(
                resolver=resolver,
                info=info,
                scan=scan,
                registry=registry,
            )
            self._runs.clear()
        return info

    def current(self) -> WorkspaceInfo:
        return self._selected().info

    @property
    def has_current(self) -> bool:
        with self._lock:
            return self._current is not None

    def files(self) -> RepositoryFileIndex:
        selected = self._selected()
        return RepositoryFileIndex(
            workspace_id=selected.info.id,
            files=list(selected.scan.files),
            scan_truncated=selected.scan.scan_truncated,
        )

    def commands(self) -> SafeCommandList:
        selected = self._selected()
        return SafeCommandList(
            workspace_id=selected.info.id,
            commands=list(selected.registry.list()),
        )

    def run_command(self, command_id: str) -> CommandRun:
        selected = self._selected()
        result = self._runner.run(
            workspace_id=selected.info.id,
            resolver=selected.resolver,
            registry=selected.registry,
            command_id=command_id,
        )
        with self._lock:
            self._runs[result.id] = result
        return result

    def command_run(self, run_id: str) -> CommandRun:
        with self._lock:
            try:
                return self._runs[run_id]
            except KeyError as exc:
                raise CommandRunNotFoundError("Command run was not found.") from exc

    def _selected(self) -> SelectedWorkspace:
        with self._lock:
            if self._current is None:
                raise NoWorkspaceSelectedError("No workspace is selected.")
            return self._current
