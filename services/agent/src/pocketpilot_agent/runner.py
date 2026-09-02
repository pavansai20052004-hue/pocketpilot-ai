"""Bounded process execution for commands supplied by the safe registry."""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import threading
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO, Protocol

from pocketpilot_agent.commands import CommandNotAllowedError
from pocketpilot_agent.models import CommandRun, CommandStatus, SafeCommand
from pocketpilot_agent.security import SafePathResolver


class CommandLookup(Protocol):
    def get(self, command_id: str) -> SafeCommand: ...


class _OutputBudget:
    def __init__(self, limit: int) -> None:
        self.remaining = limit
        self.lock = threading.Lock()

    def claim(self, requested: int) -> int:
        with self.lock:
            allowed = min(requested, self.remaining)
            self.remaining -= allowed
            return allowed


class _CappedBuffer:
    def __init__(self, budget: _OutputBudget) -> None:
        self.budget = budget
        self.data = bytearray()
        self.truncated = False

    def consume(self, stream: BinaryIO) -> None:
        while chunk := stream.read(8192):
            allowed = self.budget.claim(len(chunk))
            if allowed > 0:
                self.data.extend(chunk[:allowed])
            if allowed < len(chunk):
                self.truncated = True

    def decode(self) -> str:
        text = self.data.decode("utf-8", errors="replace")
        return f"{text}\n[output truncated]" if self.truncated else text


class SafeProcessRunner:
    """Execute one allowlisted argv without a shell and with bounded resources."""

    def __init__(self, timeout_seconds: float, max_output_bytes: int) -> None:
        if timeout_seconds <= 0 or max_output_bytes <= 0:
            raise ValueError("Runner limits must be positive.")
        self.timeout_seconds = timeout_seconds
        self.max_output_bytes = max_output_bytes

    def run(
        self,
        *,
        workspace_id: str,
        resolver: SafePathResolver,
        registry: CommandLookup,
        command_id: str,
    ) -> CommandRun:
        command = registry.get(command_id)
        cwd = resolver.resolve_relative(command.working_directory)
        if not cwd.is_dir():
            raise CommandNotAllowedError("Command working directory is not a directory.")
        executable = self._resolve_executable(command.executable)
        started_at = datetime.now(UTC)
        started_clock = time.perf_counter()
        if executable is None:
            return self._result(
                workspace_id=workspace_id,
                command=command,
                status=CommandStatus.NOT_AVAILABLE,
                exit_code=None,
                duration_ms=self._duration(started_clock),
                stdout="",
                stderr="Executable is not available.",
                output_truncated=False,
                timed_out=False,
                started_at=started_at,
            )

        creationflags = 0
        start_new_session = os.name != "nt"
        if os.name == "nt":
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
        try:
            process = subprocess.Popen(
                [executable, *command.args],
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=False,
                stdin=subprocess.DEVNULL,
                creationflags=creationflags,
                start_new_session=start_new_session,
            )
        except OSError:
            return self._result(
                workspace_id=workspace_id,
                command=command,
                status=CommandStatus.NOT_AVAILABLE,
                exit_code=None,
                duration_ms=self._duration(started_clock),
                stdout="",
                stderr="Executable could not be started.",
                output_truncated=False,
                timed_out=False,
                started_at=started_at,
            )

        output_budget = _OutputBudget(self.max_output_bytes)
        stdout_buffer = _CappedBuffer(output_budget)
        stderr_buffer = _CappedBuffer(output_budget)
        assert process.stdout is not None
        assert process.stderr is not None
        readers = [
            threading.Thread(target=stdout_buffer.consume, args=(process.stdout,), daemon=True),
            threading.Thread(target=stderr_buffer.consume, args=(process.stderr,), daemon=True),
        ]
        for reader in readers:
            reader.start()
        timed_out = False
        try:
            exit_code = process.wait(timeout=self.timeout_seconds)
        except subprocess.TimeoutExpired:
            timed_out = True
            self._terminate(process)
            exit_code = process.wait(timeout=5)
        finally:
            for reader in readers:
                reader.join(timeout=5)
            process.stdout.close()
            process.stderr.close()

        status = (
            CommandStatus.TIMED_OUT
            if timed_out
            else CommandStatus.PASSED
            if exit_code == 0
            else CommandStatus.FAILED
        )
        return self._result(
            workspace_id=workspace_id,
            command=command,
            status=status,
            exit_code=exit_code,
            duration_ms=self._duration(started_clock),
            stdout=stdout_buffer.decode(),
            stderr=stderr_buffer.decode(),
            output_truncated=stdout_buffer.truncated or stderr_buffer.truncated,
            timed_out=timed_out,
            started_at=started_at,
        )

    @staticmethod
    def _resolve_executable(executable: str) -> str | None:
        path = Path(executable)
        if path.is_absolute():
            return str(path) if path.is_file() else None
        candidates = [executable]
        if os.name == "nt" and not executable.casefold().endswith((".cmd", ".bat", ".exe")):
            candidates.insert(0, f"{executable}.cmd")
        return next(
            (resolved for candidate in candidates if (resolved := shutil.which(candidate))),
            None,
        )

    @staticmethod
    def _terminate(process: subprocess.Popen[bytes]) -> None:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                capture_output=True,
                check=False,
                shell=False,
            )
            if process.poll() is None:
                process.kill()
            return
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            return

    @staticmethod
    def _duration(started_clock: float) -> int:
        return max(0, round((time.perf_counter() - started_clock) * 1000))

    @staticmethod
    def _result(
        *,
        workspace_id: str,
        command: SafeCommand,
        status: CommandStatus,
        exit_code: int | None,
        duration_ms: int,
        stdout: str,
        stderr: str,
        output_truncated: bool,
        timed_out: bool,
        started_at: datetime,
    ) -> CommandRun:
        return CommandRun(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            command_id=command.id,
            display_command=command.display_command,
            status=status,
            exit_code=exit_code,
            duration_ms=duration_ms,
            stdout=stdout,
            stderr=stderr,
            output_truncated=output_truncated,
            timed_out=timed_out,
            started_at=started_at,
            completed_at=datetime.now(UTC),
        )
