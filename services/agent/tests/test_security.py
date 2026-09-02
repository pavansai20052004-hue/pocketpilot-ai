"""Workspace boundary and exclusion-policy security tests."""

import os
from pathlib import Path

import pytest

from pocketpilot_agent.scanner import RepositoryScanner, ScanLimits
from pocketpilot_agent.security import (
    RepositorySecurityPolicy,
    SafePathResolver,
    WorkspaceNotFoundError,
    WorkspaceSecurityError,
)


def test_valid_workspace_is_canonicalized(python_project: Path) -> None:
    resolver = SafePathResolver.select_workspace(str(python_project))

    assert resolver.root == python_project.resolve()


def test_nonexistent_workspace_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(WorkspaceNotFoundError):
        SafePathResolver.select_workspace(str(tmp_path / "missing"))


def test_workspace_selection_rejects_parent_traversal(tmp_path: Path) -> None:
    child = tmp_path / "child"
    child.mkdir()
    malicious = f"{child}{os.sep}.."

    with pytest.raises(WorkspaceSecurityError):
        SafePathResolver.select_workspace(malicious)


def test_child_resolver_rejects_absolute_path(python_project: Path, tmp_path: Path) -> None:
    resolver = SafePathResolver.select_workspace(str(python_project))

    with pytest.raises(WorkspaceSecurityError):
        resolver.resolve_relative(tmp_path.resolve())


def test_child_resolver_rejects_escape(python_project: Path) -> None:
    resolver = SafePathResolver.select_workspace(str(python_project))

    with pytest.raises(WorkspaceSecurityError):
        resolver.resolve_relative(Path("..") / "outside")


def test_symlink_escape_is_rejected_when_supported(python_project: Path, tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    link = python_project / "escape-link"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("Creating directory symlinks is not permitted on this host.")
    resolver = SafePathResolver.select_workspace(str(python_project))

    with pytest.raises(WorkspaceSecurityError):
        resolver.resolve_relative("escape-link")


def test_scanner_does_not_follow_reparse_or_symlink_directory(
    python_project: Path, tmp_path: Path
) -> None:
    outside = tmp_path / "outside-tree"
    outside.mkdir()
    (outside / "stolen.py").write_text("SECRET = True", encoding="utf-8")
    link = python_project / "linked-tree"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("Creating directory symlinks is not permitted on this host.")
    scan = RepositoryScanner(ScanLimits(100, 1024 * 1024, 10 * 1024 * 1024)).scan(
        SafePathResolver.select_workspace(str(python_project))
    )

    assert all("stolen.py" not in item.relative_path for item in scan.files)


def test_policy_recognizes_sensitive_names() -> None:
    policy = RepositorySecurityPolicy()

    assert policy.is_sensitive_file(".env.production")
    assert policy.is_sensitive_file("private.key")
    assert policy.is_sensitive_file("service-account-prod.json")
    assert not policy.is_sensitive_file("src/main.py")


@pytest.mark.skipif(os.name != "nt", reason="Windows protected-path behavior")
def test_windows_directory_cannot_be_selected() -> None:
    windows_root = os.environ.get("SystemRoot", r"C:\Windows")

    with pytest.raises(WorkspaceSecurityError):
        SafePathResolver.select_workspace(windows_root)
