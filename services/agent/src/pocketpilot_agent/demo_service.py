"""Registered demo projects, deterministic health checks, and bounded reset operations."""

from __future__ import annotations

import json
import os
import re
import shutil
import threading
from dataclasses import dataclass
from pathlib import Path

from pocketpilot_agent.analysis_provider import LLMProvider
from pocketpilot_agent.config import Settings
from pocketpilot_agent.models import (
    CommandCategory,
    CommandStatus,
    DemoHealthStatus,
    DemoProject,
    DemoResetAllResult,
    DemoResetResult,
    DemoSelection,
    PreDemoCheck,
    PreDemoCheckResult,
    PrepareDemoResult,
)
from pocketpilot_agent.validation_selector import ValidationCommandSelector
from pocketpilot_agent.workspace import WorkspaceService


class UnknownDemoError(LookupError):
    """Raised when a caller supplies anything except a registered demo ID."""


class DemoResetError(RuntimeError):
    """Raised when a registered demo cannot be restored safely."""


@dataclass(frozen=True, slots=True)
class RegisteredDemo:
    id: str
    directory: str
    canonical_files: tuple[str, ...]


REGISTERED_DEMOS = (
    RegisteredDemo("python-null-user", "python-broken-app", ("user_service.py",)),
    RegisteredDemo(
        "java-null-user",
        "java-broken-app",
        ("src/main/java/demo/UserService.java",),
    ),
    RegisteredDemo(
        "react-null-profile",
        "react-broken-app",
        ("src/UserProfile.tsx",),
    ),
)


class DemoService:
    """Operate only on compile-time registered projects beneath the demo root."""

    _valid_id = re.compile(r"^[a-z0-9-]{1,64}$")

    def __init__(
        self,
        settings: Settings,
        workspace: WorkspaceService,
        provider: LLMProvider,
    ) -> None:
        configured = Path(settings.demo_root_path)
        repository_root = Path(__file__).resolve().parents[4]
        demo_root = configured if configured.is_absolute() else repository_root / configured
        self.root = demo_root.resolve()
        self.fixtures = (self.root / "fixtures").resolve()
        self.settings = settings
        self.workspace = workspace
        self.provider = provider
        self._registry = {item.id: item for item in REGISTERED_DEMOS}
        self._selector = ValidationCommandSelector()
        self._lock = threading.RLock()

    def list(self) -> list[DemoProject]:
        return [self.check(item.id) for item in REGISTERED_DEMOS]

    def select(self, demo_id: str) -> DemoSelection:
        entry = self._entry(demo_id)
        project = self._project_path(entry)
        workspace = self.workspace.inspect(str(project))
        return DemoSelection(demo=self.check(demo_id), workspace=workspace)

    def check(self, demo_id: str) -> DemoProject:
        entry = self._entry(demo_id)
        try:
            metadata = self._metadata(entry)
            self._validate_layout(entry, metadata)
            isolated = WorkspaceService(self.settings)
            inspected = isolated.inspect(str(self._project_path(entry)))
            test_commands = [
                command
                for command in inspected.detected_commands
                if command.category is CommandCategory.TEST
            ]
            command = self._selector.select(test_commands)
            if command is None:
                return self._view(
                    metadata,
                    DemoHealthStatus.TOOL_MISSING,
                    self._missing_tool_detail(entry),
                    0,
                )
            result = isolated.run_command(command.id)
            output = f"{result.stdout}\n{result.stderr}"
            if result.status is not CommandStatus.FAILED:
                detail = (
                    "Intentional failure did not reproduce; reset this demo."
                    if result.status is CommandStatus.PASSED
                    else f"Validation ended with {result.status}."
                )
                return self._view(
                    metadata, DemoHealthStatus.BROKEN_SETUP, detail, result.duration_ms
                )
            expected_type = str(metadata["expected_error_type"])
            expected_file = Path(str(metadata["expected_file"])).name
            critical_tokens = [str(item) for item in metadata["critical_ocr_tokens"]]
            missing_tokens = [token for token in critical_tokens if token not in output]
            if (
                expected_type not in output
                or expected_file not in output
                or missing_tokens
            ):
                return self._view(
                    metadata,
                    DemoHealthStatus.BROKEN_SETUP,
                    "Test failed, but one or more critical demo tokens were absent.",
                    result.duration_ms,
                )
            return self._view(
                metadata,
                DemoHealthStatus.READY,
                "Expected broken test reproduced through the registered safe command.",
                result.duration_ms,
            )
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            return DemoProject(
                id=entry.id,
                name=entry.directory,
                language="Unknown",
                framework="Unknown",
                expected_error_type="Unknown",
                expected_file="Unknown",
                critical_ocr_tokens=[],
                status=DemoHealthStatus.BROKEN_SETUP,
                detail=f"Demo layout is invalid: {type(exc).__name__}.",
                validation_duration_ms=0,
            )

    def reset(self, demo_id: str) -> DemoResetResult:
        entry = self._entry(demo_id)
        project = self._project_path(entry)
        fixture_root = self._bounded(self.fixtures / entry.id, self.fixtures)
        restored: list[str] = []
        with self._lock:
            for relative in entry.canonical_files:
                source = self._bounded(fixture_root / relative, fixture_root)
                target = self._bounded(project / relative, project)
                if not source.is_file() or source.is_symlink() or target.is_symlink():
                    raise DemoResetError("Canonical demo source is missing or unsafe.")
                target.parent.mkdir(parents=True, exist_ok=True)
                temporary = target.with_name(f".{target.name}.pocketpilot-reset")
                try:
                    shutil.copyfile(source, temporary)
                    os.replace(temporary, target)
                finally:
                    temporary.unlink(missing_ok=True)
                if target.read_bytes() != source.read_bytes():
                    raise DemoResetError("Reset byte verification failed.")
                restored.append(relative)
        health = self.check(demo_id)
        result = "DEMO_READY" if health.status is DemoHealthStatus.READY else health.status.value
        return DemoResetResult(demo=health, result=result, restored_files=restored)

    def reset_all(self) -> DemoResetAllResult:
        results = [self.reset(item.id) for item in REGISTERED_DEMOS]
        ready_or_missing = all(
            item.result in {"DEMO_READY", DemoHealthStatus.TOOL_MISSING.value}
            for item in results
        )
        all_ready = all(item.result == "DEMO_READY" for item in results)
        return DemoResetAllResult(
            demos=results,
            overall=(
                "READY"
                if all_ready
                else "READY_WITH_TOOL_GAPS"
                if ready_or_missing
                else "NOT_READY"
            ),
        )

    async def preflight(
        self, *, agent_reachable: bool = True, check_workspace: bool = True
    ) -> PreDemoCheckResult:
        demos = self.list()
        provider = await self.provider.health()
        checks = [
            PreDemoCheck(
                name="Agent",
                status="READY" if agent_reachable else "NOT_READY",
                detail=(
                    "FastAPI preflight endpoint is reachable."
                    if agent_reachable
                    else "FastAPI health endpoint is not reachable on the configured port."
                ),
            ),
            PreDemoCheck(
                name="Pairing",
                status="READY",
                detail="Authenticated mobile pairing routes are registered.",
            ),
            PreDemoCheck(
                name="WebSocket",
                status="READY",
                detail="Session event WebSocket route is registered.",
            ),
            PreDemoCheck(
                name="Workspace",
                status=(
                    "READY"
                    if self.workspace.has_current
                    else "NOT_READY"
                    if check_workspace
                    else "NOT_CHECKED"
                ),
                detail=(
                    f"Selected workspace: {self.workspace.current().name}."
                    if self.workspace.has_current
                    else "Select a registered demo before the final presentation check."
                ),
            ),
            PreDemoCheck(
                name=(
                    "Local AI"
                    if self.provider.name == "ollama"
                    else "Deterministic demo provider"
                ),
                status="READY" if provider.available else "NOT_READY",
                detail=provider.detail,
            ),
        ]
        checks.extend(
            PreDemoCheck(name=item.language, status=item.status.value, detail=item.detail)
            for item in demos
        )
        checks.extend(
            (
                PreDemoCheck(
                    name="Camera requirements",
                    status="DOCUMENTED",
                    detail="Use the physical Android camera against real terminal output.",
                ),
                PreDemoCheck(
                    name="Speech requirements",
                    status="DOCUMENTED",
                    detail="Use push-to-talk and wait for SPEAK NOW before each command.",
                ),
            )
        )
        blocking = {"NOT_READY", DemoHealthStatus.BROKEN_SETUP.value}
        overall = "READY" if not any(item.status in blocking for item in checks) else "NOT_READY"
        if overall == "READY" and any(
            item.status is DemoHealthStatus.TOOL_MISSING for item in demos
        ):
            overall = "READY_WITH_TOOL_GAPS"
        return PreDemoCheckResult(
            checks=checks,
            overall=overall,
            provider=provider.provider,
            model=provider.model,
        )

    async def prepare(self, demo_id: str) -> PrepareDemoResult:
        """Restore and verify one registered demo, then select it for presentation."""
        reset = self.reset(demo_id)
        if reset.demo.status is not DemoHealthStatus.READY:
            raise DemoResetError(
                f"{reset.demo.name} is not ready: {reset.demo.detail}"
            )
        selected = self.select(demo_id)
        readiness = await self.preflight()
        return PrepareDemoResult(
            demo=selected.demo,
            workspace=selected.workspace,
            readiness=readiness,
        )

    def _entry(self, demo_id: str) -> RegisteredDemo:
        if not self._valid_id.fullmatch(demo_id):
            raise UnknownDemoError("Demo ID is not registered.")
        try:
            return self._registry[demo_id]
        except KeyError as exc:
            raise UnknownDemoError("Demo ID is not registered.") from exc

    def _project_path(self, entry: RegisteredDemo) -> Path:
        return self._bounded(self.root / entry.directory, self.root)

    def _metadata(self, entry: RegisteredDemo) -> dict[str, object]:
        path = self._bounded(self._project_path(entry) / "demo.json", self.root)
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("id") != entry.id:
            raise ValueError("Demo metadata ID does not match the registry.")
        return payload

    def _validate_layout(self, entry: RegisteredDemo, metadata: dict[str, object]) -> None:
        project = self._project_path(entry)
        expected = self._bounded(project / str(metadata["expected_file"]), project)
        if not project.is_dir() or not expected.is_file():
            raise ValueError("Required demo files are missing.")
        for relative in entry.canonical_files:
            fixture = self._bounded(self.fixtures / entry.id / relative, self.fixtures)
            target = self._bounded(project / relative, project)
            if not fixture.is_file() or not target.is_file():
                raise ValueError("Reset fixture is incomplete.")

    @staticmethod
    def _view(
        metadata: dict[str, object],
        status: DemoHealthStatus,
        detail: str,
        duration_ms: int,
    ) -> DemoProject:
        return DemoProject(
            id=str(metadata["id"]),
            name=str(metadata["name"]),
            language=str(metadata["language"]),
            framework=str(metadata["framework"]),
            expected_error_type=str(metadata["expected_error_type"]),
            expected_file=str(metadata["expected_file"]),
            critical_ocr_tokens=[str(item) for item in metadata["critical_ocr_tokens"]],
            status=status,
            detail=detail,
            validation_duration_ms=duration_ms,
        )

    @staticmethod
    def _bounded(candidate: Path, boundary: Path) -> Path:
        resolved_boundary = boundary.resolve()
        resolved = candidate.resolve()
        try:
            resolved.relative_to(resolved_boundary)
        except ValueError as exc:
            raise DemoResetError("Demo path escaped the registered boundary.") from exc
        return resolved

    @staticmethod
    def _missing_tool_detail(entry: RegisteredDemo) -> str:
        if entry.id == "java-null-user":
            return "Maven is not installed or no safe Maven test command was detected."
        if entry.id == "react-null-profile":
            return "npm is not installed or no safe npm test command was detected."
        return "pytest is unavailable or no safe pytest command was detected."
