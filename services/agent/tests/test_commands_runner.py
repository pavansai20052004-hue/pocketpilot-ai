"""Safe command registry and non-shell process-runner tests."""

import subprocess
import sys
from pathlib import Path

import pytest

from pocketpilot_agent.commands import CommandNotAllowedError, SafeCommandRegistry
from pocketpilot_agent.models import CommandCategory, CommandRun, CommandStatus, SafeCommand
from pocketpilot_agent.runner import SafeProcessRunner
from pocketpilot_agent.security import SafePathResolver, WorkspaceSecurityError


class FixedRegistry:
    def __init__(self, command: SafeCommand) -> None:
        self.command = command

    def get(self, command_id: str) -> SafeCommand:
        if command_id != self.command.id:
            raise CommandNotAllowedError("blocked")
        return self.command


def command(*args: str, executable: str = sys.executable, cwd: str = ".") -> SafeCommand:
    return SafeCommand(
        id="fixture-command",
        label="Fixture command",
        category=CommandCategory.TEST,
        executable=executable,
        args=list(args),
        display_command="fixture command",
        working_directory=cwd,
        evidence="test-owned fixed registry",
    )


def run(
    root: Path, item: SafeCommand, *, timeout: float = 3, cap: int = 4096
) -> CommandRun:
    return SafeProcessRunner(timeout, cap).run(
        workspace_id="fixture",
        resolver=SafePathResolver.select_workspace(str(root)),
        registry=FixedRegistry(item),
        command_id=item.id,
    )


def test_unknown_and_injection_like_ids_are_rejected(tmp_path: Path) -> None:
    item = command("-c", "print('safe')")
    registry = FixedRegistry(item)
    runner = SafeProcessRunner(3, 4096)
    resolver = SafePathResolver.select_workspace(str(tmp_path))

    for malicious in ("unknown", "fixture-command; whoami", "../../bin/sh"):
        with pytest.raises(CommandNotAllowedError):
            runner.run(
                workspace_id="fixture",
                resolver=resolver,
                registry=registry,
                command_id=malicious,
            )


def test_registry_rejects_unknown_command_directly() -> None:
    registry = SafeCommandRegistry(())

    with pytest.raises(CommandNotAllowedError):
        registry.get("deploy")


def test_runner_captures_stdout_stderr_and_exit_code(tmp_path: Path) -> None:
    result = run(
        tmp_path,
        command("-c", "import sys; print('out'); print('err', file=sys.stderr); sys.exit(7)"),
    )

    assert result.status is CommandStatus.FAILED
    assert result.exit_code == 7
    assert "out" in result.stdout
    assert "err" in result.stderr
    assert result.duration_ms >= 0


def test_runner_reports_success(tmp_path: Path) -> None:
    result = run(tmp_path, command("-c", "print('passed')"))

    assert result.status is CommandStatus.PASSED
    assert result.exit_code == 0
    assert "passed" in result.stdout


def test_runner_times_out_and_kills_process(tmp_path: Path) -> None:
    result = run(
        tmp_path,
        command("-c", "import time; time.sleep(10)"),
        timeout=0.1,
    )

    assert result.status is CommandStatus.TIMED_OUT
    assert result.timed_out is True


def test_runner_caps_output(tmp_path: Path) -> None:
    result = run(tmp_path, command("-c", "print('x' * 10000)"), cap=128)

    assert result.status is CommandStatus.PASSED
    assert result.output_truncated is True
    assert len(result.stdout) < 200


def test_runner_handles_missing_executable(tmp_path: Path) -> None:
    result = run(tmp_path, command(executable="pocketpilot-definitely-missing"))

    assert result.status is CommandStatus.NOT_AVAILABLE
    assert result.exit_code is None


def test_runner_enforces_working_directory_boundary(tmp_path: Path) -> None:
    item = command("-c", "print('never')", cwd="../outside")

    with pytest.raises(WorkspaceSecurityError):
        run(tmp_path, item)


def test_runner_always_disables_shell(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    import pocketpilot_agent.runner as runner_module

    original_popen = runner_module.subprocess.Popen
    observed: list[bool] = []

    def recording_popen(*args: object, **kwargs: object) -> subprocess.Popen[bytes]:
        observed.append(bool(kwargs.get("shell")))
        return original_popen(*args, **kwargs)

    monkeypatch.setattr(runner_module.subprocess, "Popen", recording_popen)
    result = run(tmp_path, command("-c", "print('safe')"))

    assert result.status is CommandStatus.PASSED
    assert observed == [False]
