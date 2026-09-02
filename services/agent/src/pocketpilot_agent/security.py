"""Reusable workspace boundary and repository exclusion policy."""

from __future__ import annotations

import fnmatch
import os
import stat
from pathlib import Path


class WorkspaceSecurityError(ValueError):
    """Raised when a requested path violates the selected workspace boundary."""


class WorkspaceNotFoundError(FileNotFoundError):
    """Raised when a requested workspace does not exist or is not a directory."""


class RepositorySecurityPolicy:
    """Central deny-by-default policy for metadata scans and future content access."""

    ignored_directories = frozenset(
        {
            ".git",
            ".gradle",
            ".idea",
            ".mypy_cache",
            ".next",
            ".nuxt",
            ".pytest_cache",
            ".expo",
            ".venv",
            ".vscode",
            "__pycache__",
            "build",
            "coverage",
            "dist",
            "node_modules",
            "target",
            "vendor",
            "venv",
        }
    )
    sensitive_names = frozenset(
        {".env", "credentials.json", "id_ed25519", "id_rsa"}
    )
    sensitive_patterns = (
        ".env.*",
        "*.pem",
        "*.key",
        "*.p12",
        "*.pfx",
        "service-account*.json",
    )
    blocked_extensions = frozenset(
        {
            ".7z",
            ".a",
            ".avi",
            ".bin",
            ".bmp",
            ".class",
            ".db",
            ".dll",
            ".dylib",
            ".exe",
            ".gif",
            ".gz",
            ".ico",
            ".jar",
            ".jpeg",
            ".jpg",
            ".lockb",
            ".mov",
            ".mp3",
            ".mp4",
            ".o",
            ".pdf",
            ".png",
            ".pyc",
            ".so",
            ".sqlite",
            ".sqlite3",
            ".tar",
            ".tgz",
            ".wav",
            ".webm",
            ".webp",
            ".woff",
            ".woff2",
            ".zip",
        }
    )

    def is_ignored_directory(self, name: str) -> bool:
        return name.casefold() in self.ignored_directories

    def is_sensitive_file(self, name: str) -> bool:
        normalized = name.casefold()
        return normalized in self.sensitive_names or any(
            fnmatch.fnmatch(normalized, pattern) for pattern in self.sensitive_patterns
        )

    def is_blocked_binary_or_archive(self, path: Path) -> bool:
        return path.suffix.casefold() in self.blocked_extensions

    @staticmethod
    def is_reparse_point(path: Path) -> bool:
        """Detect links and Windows reparse points without following them."""

        try:
            path_stat = path.lstat()
        except OSError:
            return True
        if stat.S_ISLNK(path_stat.st_mode):
            return True
        attributes = getattr(path_stat, "st_file_attributes", 0)
        reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
        return bool(attributes & reparse_flag)


class SafePathResolver:
    """Resolve paths while proving they remain beneath one selected root."""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve(strict=True)

    @classmethod
    def select_workspace(cls, raw_root: str) -> SafePathResolver:
        raw_root = raw_root.strip()
        if not raw_root:
            raise WorkspaceNotFoundError("Workspace path is required.")
        candidate = Path(raw_root).expanduser()
        if ".." in candidate.parts:
            raise WorkspaceSecurityError("Workspace paths may not contain parent traversal.")
        try:
            resolved = candidate.resolve(strict=True)
        except (OSError, RuntimeError) as exc:
            raise WorkspaceNotFoundError("Workspace does not exist.") from exc
        if not resolved.is_dir():
            raise WorkspaceNotFoundError("Workspace must be an existing directory.")
        if cls._is_protected_system_root(resolved):
            raise WorkspaceSecurityError("Operating-system directories cannot be selected.")
        if not os.access(resolved, os.R_OK):
            raise WorkspaceSecurityError("Workspace is not readable.")
        return cls(resolved)

    def resolve_relative(self, raw_path: str | Path, *, must_exist: bool = True) -> Path:
        candidate = Path(raw_path)
        if candidate.is_absolute() or candidate.drive:
            raise WorkspaceSecurityError("Absolute child paths are not allowed.")
        if ".." in candidate.parts:
            raise WorkspaceSecurityError("Parent traversal is not allowed.")
        combined = self.root / candidate
        try:
            resolved = combined.resolve(strict=must_exist)
        except (OSError, RuntimeError) as exc:
            raise WorkspaceNotFoundError("Path does not exist inside the workspace.") from exc
        try:
            common = Path(os.path.commonpath((self.root, resolved)))
        except ValueError as exc:
            raise WorkspaceSecurityError("Path is outside the selected workspace.") from exc
        if os.path.normcase(str(common)) != os.path.normcase(str(self.root)):
            raise WorkspaceSecurityError("Path is outside the selected workspace.")
        return resolved

    @staticmethod
    def _is_protected_system_root(path: Path) -> bool:
        resolved = Path(os.path.normcase(str(path)))
        if path.parent == path:
            return True
        protected: list[Path] = []
        if os.name == "nt":
            for variable in ("SystemRoot", "ProgramFiles", "ProgramFiles(x86)", "ProgramData"):
                value = os.environ.get(variable)
                if value:
                    protected.append(Path(os.path.normcase(str(Path(value).resolve()))))
        else:
            protected.extend(Path(item) for item in ("/bin", "/etc", "/sbin", "/usr", "/var"))
        return any(resolved == item or item in resolved.parents for item in protected)
