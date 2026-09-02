"""Bounded, metadata-first repository scanning."""

from __future__ import annotations

import os
import time
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from pocketpilot_agent.models import DetectedLanguage, FileCategory, RepositoryFile
from pocketpilot_agent.security import RepositorySecurityPolicy, SafePathResolver

LANGUAGE_EXTENSIONS = {
    ".css": "CSS",
    ".htm": "HTML",
    ".html": "HTML",
    ".java": "Java",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".py": "Python",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
}

MANIFEST_NAMES = frozenset(
    {
        "build.gradle",
        "build.gradle.kts",
        "next.config.js",
        "next.config.mjs",
        "next.config.ts",
        "package.json",
        "pnpm-lock.yaml",
        "pom.xml",
        "pyproject.toml",
        "pytest.ini",
        "requirements.txt",
        "vite.config.js",
        "vite.config.mjs",
        "vite.config.ts",
        "vite.config.mts",
        "yarn.lock",
    }
)

DOCUMENTATION_EXTENSIONS = frozenset({".md", ".mdx", ".rst", ".txt"})
CONFIG_EXTENSIONS = frozenset({".json", ".toml", ".yaml", ".yml", ".ini", ".cfg"})


@dataclass(frozen=True, slots=True)
class ScanLimits:
    max_files: int
    max_file_size: int
    max_repository_scan_size: int


@dataclass(frozen=True, slots=True)
class RepositoryScan:
    files: tuple[RepositoryFile, ...]
    languages: tuple[DetectedLanguage, ...]
    file_count: int
    relevant_file_count: int
    total_size: int
    scan_truncated: bool
    scan_duration_ms: int
    git_detected: bool
    git_branch: str | None


class RepositoryScanner:
    """Collect safe file metadata without bulk content ingestion."""

    def __init__(
        self,
        limits: ScanLimits,
        policy: RepositorySecurityPolicy | None = None,
    ) -> None:
        self.limits = limits
        self.policy = policy or RepositorySecurityPolicy()

    def scan(self, resolver: SafePathResolver) -> RepositoryScan:
        started = time.perf_counter()
        files: list[RepositoryFile] = []
        language_counts: Counter[str] = Counter()
        file_count = 0
        relevant_file_count = 0
        total_size = 0
        scan_truncated = False
        pending = [resolver.root]

        while pending and not scan_truncated:
            directory = pending.pop()
            try:
                entries = sorted(os.scandir(directory), key=lambda entry: entry.name.casefold())
            except OSError:
                continue
            for entry in entries:
                entry_path = Path(entry.path)
                if entry.is_dir(follow_symlinks=False):
                    if self.policy.is_ignored_directory(entry.name):
                        continue
                    if self.policy.is_reparse_point(entry_path):
                        continue
                    pending.append(entry_path)
                    continue
                if not entry.is_file(follow_symlinks=False):
                    continue
                if self.policy.is_reparse_point(entry_path):
                    continue
                try:
                    metadata = entry.stat(follow_symlinks=False)
                except OSError:
                    continue

                if (
                    file_count >= self.limits.max_files
                    or total_size + metadata.st_size
                    > self.limits.max_repository_scan_size
                ):
                    scan_truncated = True
                    break
                file_count += 1
                total_size += metadata.st_size

                relative = entry_path.relative_to(resolver.root)
                extension = entry_path.suffix.casefold()
                language = LANGUAGE_EXTENSIONS.get(extension)
                category = self._category(relative, metadata.st_size)
                repository_file = RepositoryFile(
                    relative_path=relative.as_posix(),
                    extension=extension,
                    language=language,
                    size_bytes=metadata.st_size,
                    modified_time=datetime.fromtimestamp(metadata.st_mtime, tz=UTC),
                    category=category,
                )
                files.append(repository_file)
                if category not in {FileCategory.EXCLUDED_SENSITIVE, FileCategory.GENERATED}:
                    relevant_file_count += 1
                    if language is not None:
                        language_counts[language] += 1

        languages = tuple(
            DetectedLanguage(name=name, files=count)
            for name, count in sorted(
                language_counts.items(), key=lambda item: (-item[1], item[0])
            )
        )
        git_detected, git_branch = self._git_metadata(resolver.root)
        duration = max(0, round((time.perf_counter() - started) * 1000))
        return RepositoryScan(
            files=tuple(sorted(files, key=lambda item: item.relative_path.casefold())),
            languages=languages,
            file_count=file_count,
            relevant_file_count=relevant_file_count,
            total_size=total_size,
            scan_truncated=scan_truncated,
            scan_duration_ms=duration,
            git_detected=git_detected,
            git_branch=git_branch,
        )

    def _category(self, relative_path: Path, size_bytes: int) -> FileCategory:
        name = relative_path.name.casefold()
        extension = relative_path.suffix.casefold()
        if self.policy.is_sensitive_file(name):
            return FileCategory.EXCLUDED_SENSITIVE
        if (
            size_bytes > self.limits.max_file_size
            or self.policy.is_blocked_binary_or_archive(relative_path)
        ):
            return FileCategory.GENERATED
        if name in MANIFEST_NAMES or name in {"gradlew", "gradlew.bat", "mvnw", "mvnw.cmd"}:
            return FileCategory.BUILD
        if extension in DOCUMENTATION_EXTENSIONS:
            return FileCategory.DOCUMENTATION
        if extension in CONFIG_EXTENSIONS or name.startswith(("tsconfig", "eslint", "babel")):
            return FileCategory.CONFIG
        normalized_parts = {part.casefold() for part in relative_path.parts[:-1]}
        if normalized_parts.intersection({"test", "tests", "__tests__", "spec", "specs"}) or any(
            token in relative_path.stem.casefold() for token in (".test", "_test", ".spec")
        ):
            return FileCategory.TEST
        if extension in LANGUAGE_EXTENSIONS:
            return FileCategory.SOURCE
        return FileCategory.CONFIG

    @staticmethod
    def _git_metadata(root: Path) -> tuple[bool, str | None]:
        git_path = root / ".git"
        if not git_path.exists():
            return False, None
        if not git_path.is_dir():
            return True, None
        head = git_path / "HEAD"
        try:
            value = head.read_text(encoding="utf-8", errors="replace").strip()
        except OSError:
            return True, None
        prefix = "ref: refs/heads/"
        return True, value[len(prefix) :] if value.startswith(prefix) else None
