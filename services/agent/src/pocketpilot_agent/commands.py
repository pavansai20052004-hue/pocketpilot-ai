"""Evidence-derived registry of immutable safe command templates."""

from __future__ import annotations

import hashlib
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

from pocketpilot_agent.detector import ProjectDetector
from pocketpilot_agent.models import CommandCategory, RepositoryFile, SafeCommand
from pocketpilot_agent.security import SafePathResolver

SAFE_PACKAGE_SCRIPTS: dict[str, tuple[str, CommandCategory]] = {
    "build": ("Build", CommandCategory.BUILD),
    "lint": ("Lint", CommandCategory.LINT),
    "test": ("Run tests", CommandCategory.TEST),
    "typecheck": ("Type check", CommandCategory.TYPECHECK),
}


class CommandNotAllowedError(ValueError):
    """Raised when a command ID was not created by the current registry."""


class SafeCommandRegistry:
    """Create and look up commands only from versioned, evidence-backed templates."""

    def __init__(self, commands: tuple[SafeCommand, ...]) -> None:
        self._commands = {command.id: command for command in commands}

    @classmethod
    def detect(
        cls,
        resolver: SafePathResolver,
        files: tuple[RepositoryFile, ...],
        detector: ProjectDetector,
    ) -> SafeCommandRegistry:
        commands: list[SafeCommand] = []
        paths = {item.relative_path for item in files}
        for repository_file in files:
            relative = repository_file.relative_path
            path = Path(relative)
            name = path.name.casefold()
            working_directory = "." if path.parent.as_posix() == "." else path.parent.as_posix()
            if name == "package.json":
                payload = detector.load_package_json(relative)
                if payload is not None:
                    commands.extend(
                        cls._package_commands(
                            resolver,
                            payload,
                            relative,
                            working_directory,
                            paths,
                        )
                    )
            elif name == "pom.xml":
                commands.extend(cls._maven_commands(resolver, relative, working_directory, paths))
            elif name in {"build.gradle", "build.gradle.kts"}:
                commands.extend(cls._gradle_commands(resolver, relative, working_directory, paths))
            elif name in {"pyproject.toml", "pytest.ini", "requirements.txt"}:
                commands.extend(
                    cls._python_commands(relative, working_directory, files)
                )
        unique = {command.id: command for command in commands}
        ordered = sorted(
            unique.values(), key=lambda item: (item.working_directory, item.label)
        )
        return cls(tuple(ordered))

    def list(self) -> tuple[SafeCommand, ...]:
        return tuple(self._commands.values())

    def get(self, command_id: str) -> SafeCommand:
        try:
            return self._commands[command_id]
        except KeyError as exc:
            raise CommandNotAllowedError(
                "Command is not in the current workspace allowlist."
            ) from exc

    @classmethod
    def _package_commands(
        cls,
        resolver: SafePathResolver,
        payload: dict[str, object],
        manifest: str,
        working_directory: str,
        paths: set[str],
    ) -> list[SafeCommand]:
        scripts = payload.get("scripts")
        if not isinstance(scripts, dict):
            return []
        manager = cls._package_manager(working_directory, paths)
        invocation = cls._package_manager_invocation(manager)
        if invocation is None:
            return []
        executable, prefix_args = invocation
        resolver.resolve_relative(working_directory)
        commands: list[SafeCommand] = []
        for script_name, (label, category) in SAFE_PACKAGE_SCRIPTS.items():
            script_value = scripts.get(script_name)
            if not isinstance(script_value, str) or not script_value.strip():
                continue
            args = [*prefix_args, "run", script_name]
            commands.append(
                cls._command(
                    kind=manager,
                    label=f"{label} ({working_directory})",
                    category=category,
                    executable=executable,
                    args=args,
                    working_directory=working_directory,
                    evidence=f"safe '{script_name}' script in {manifest}",
                    display_argv=[manager, "run", script_name],
                )
            )
        return commands

    @classmethod
    def _maven_commands(
        cls,
        resolver: SafePathResolver,
        manifest: str,
        working_directory: str,
        paths: set[str],
    ) -> list[SafeCommand]:
        wrapper_name = "mvnw.cmd" if os.name == "nt" else "mvnw"
        wrapper_relative = cls._join_relative(working_directory, wrapper_name)
        if wrapper_relative in paths:
            executable = str(resolver.resolve_relative(wrapper_relative))
        else:
            executable = cls._find_executable("mvn")
        if executable is None:
            return []
        templates = (
            ("Run Maven tests", CommandCategory.TEST, ["test"]),
            ("Run quiet Maven tests", CommandCategory.TEST, ["-q", "test"]),
            ("Build Maven package", CommandCategory.BUILD, ["package", "-DskipTests"]),
        )
        return [
            cls._command(
                kind="maven",
                label=f"{label} ({working_directory})",
                category=category,
                executable=executable,
                args=args,
                working_directory=working_directory,
                evidence=f"Maven project detected by {manifest}",
            )
            for label, category, args in templates
        ]

    @classmethod
    def _gradle_commands(
        cls,
        resolver: SafePathResolver,
        manifest: str,
        working_directory: str,
        paths: set[str],
    ) -> list[SafeCommand]:
        wrapper_name = "gradlew.bat" if os.name == "nt" else "gradlew"
        wrapper_relative = cls._join_relative(working_directory, wrapper_name)
        if wrapper_relative in paths:
            executable = str(resolver.resolve_relative(wrapper_relative))
        else:
            executable = cls._find_executable("gradle")
        if executable is None:
            return []
        return [
            cls._command(
                kind="gradle",
                label=f"{label} ({working_directory})",
                category=category,
                executable=executable,
                args=[task],
                working_directory=working_directory,
                evidence=f"Gradle project detected by {manifest}",
            )
            for label, category, task in (
                ("Run Gradle tests", CommandCategory.TEST, "test"),
                ("Run Gradle build", CommandCategory.BUILD, "build"),
            )
        ]

    @classmethod
    def _python_commands(
        cls,
        manifest: str,
        working_directory: str,
        files: tuple[RepositoryFile, ...],
    ) -> list[SafeCommand]:
        prefix = "" if working_directory == "." else f"{working_directory}/"
        has_tests = any(
            item.relative_path.startswith(prefix)
            and ({part.casefold() for part in Path(item.relative_path).parts} & {"test", "tests"})
            for item in files
        )
        manifest_file = next((item for item in files if item.relative_path == manifest), None)
        pytest_evidence = Path(manifest).name.casefold() == "pytest.ini" or has_tests
        if manifest_file is None or not pytest_evidence:
            return []
        return [
            cls._command(
                kind="python",
                label=f"Run pytest ({working_directory})",
                category=CommandCategory.TEST,
                executable=sys.executable,
                args=["-m", "pytest", "-q"],
                working_directory=working_directory,
                evidence=f"pytest-compatible tests detected with {manifest}",
            )
        ]

    @classmethod
    def _command(
        cls,
        *,
        kind: str,
        label: str,
        category: CommandCategory,
        executable: str,
        args: list[str],
        working_directory: str,
        evidence: str,
        display_argv: list[str] | None = None,
    ) -> SafeCommand:
        fingerprint = "\0".join((kind, working_directory, *args))
        suffix = hashlib.sha256(fingerprint.encode()).hexdigest()[:12]
        display_executable = Path(executable).name if Path(executable).is_absolute() else executable
        display = cls._display(display_argv or [display_executable, *args])
        return SafeCommand(
            id=f"{kind}-{suffix}",
            label=label,
            category=category,
            executable=executable,
            args=args,
            display_command=display,
            working_directory=working_directory,
            evidence=evidence,
        )

    @staticmethod
    def _package_manager(working_directory: str, paths: set[str]) -> str:
        candidates = [working_directory]
        if working_directory != ".":
            candidates.append(".")
        for directory in candidates:
            if SafeCommandRegistry._join_relative(directory, "pnpm-lock.yaml") in paths:
                return "pnpm"
            if SafeCommandRegistry._join_relative(directory, "yarn.lock") in paths:
                return "yarn"
        return "npm"

    @staticmethod
    def _find_executable(name: str) -> str | None:
        candidates = [name]
        if os.name == "nt" and not name.casefold().endswith((".cmd", ".bat", ".exe")):
            candidates.insert(0, f"{name}.cmd")
        return next(
            (resolved for candidate in candidates if (resolved := shutil.which(candidate))),
            None,
        )

    @classmethod
    def _package_manager_invocation(cls, manager: str) -> tuple[str, list[str]] | None:
        executable = cls._find_executable(manager)
        if executable is None:
            return None
        if os.name != "nt" or Path(executable).suffix.casefold() not in {".cmd", ".bat"}:
            return executable, []
        if manager != "npm":
            return None
        node = cls._find_executable("node")
        npm_cli = Path(executable).parent / "node_modules" / "npm" / "bin" / "npm-cli.js"
        if node is None or not npm_cli.is_file():
            return None
        return node, [str(npm_cli)]

    @staticmethod
    def _display(argv: list[str]) -> str:
        return subprocess.list2cmdline(argv) if os.name == "nt" else shlex.join(argv)

    @staticmethod
    def _join_relative(directory: str, name: str) -> str:
        return name if directory == "." else f"{directory}/{name}"
