"""Repository scanner and evidence-backed detector tests."""

from pathlib import Path

from pocketpilot_agent.config import Settings
from pocketpilot_agent.models import FileCategory
from pocketpilot_agent.scanner import RepositoryScanner, ScanLimits
from pocketpilot_agent.security import SafePathResolver
from pocketpilot_agent.workspace import WorkspaceService


def service(**overrides: int) -> WorkspaceService:
    return WorkspaceService(Settings(**overrides))


def test_python_fastapi_project_is_detected(python_project: Path) -> None:
    workspace = service().inspect(str(python_project))

    assert "PYTHON_FASTAPI" in {item.project_type for item in workspace.project_types}
    assert "FastAPI" in {item.name for item in workspace.frameworks}
    assert "Python" in {item.name for item in workspace.languages}
    assert any("pytest" in command.display_command for command in workspace.detected_commands)


def test_java_maven_spring_project_is_detected(java_project: Path) -> None:
    workspace = service().inspect(str(java_project))

    assert "JAVA_MAVEN_SPRING_BOOT" in {item.project_type for item in workspace.project_types}
    assert "Spring Boot" in {item.name for item in workspace.frameworks}
    assert "Maven" in workspace.build_systems
    assert "Java" in {item.name for item in workspace.languages}


def test_react_vite_project_and_safe_scripts_are_detected(react_project: Path) -> None:
    workspace = service().inspect(str(react_project))
    displays = {command.display_command for command in workspace.detected_commands}

    assert "REACT_VITE" in {item.project_type for item in workspace.project_types}
    assert {"React", "Vite", "Node.js"}.issubset(
        {item.name for item in workspace.frameworks}
    )
    assert any("run test" in display for display in displays)
    assert any("run build" in display for display in displays)
    assert any("run typecheck" in display for display in displays)
    assert all("deploy" not in display for display in displays)
    assert all("postinstall" not in display for display in displays)


def test_sensitive_files_are_metadata_only_and_ignored_tree_is_absent(
    python_project: Path,
) -> None:
    service_instance = service()
    service_instance.inspect(str(python_project))
    files = service_instance.files().files
    indexed = {item.relative_path: item for item in files}

    assert indexed["src/main.py"].category is FileCategory.SOURCE
    assert indexed[".env"].category is FileCategory.EXCLUDED_SENSITIVE
    assert indexed["private.key"].category is FileCategory.EXCLUDED_SENSITIVE
    assert "ignored.js" not in {Path(item.relative_path).name for item in files}
    assert all(not hasattr(item, "content") for item in files)


def test_language_counts_are_meaningful(react_project: Path) -> None:
    workspace = service().inspect(str(react_project))
    counts = {language.name: language.files for language in workspace.languages}

    assert counts["TypeScript"] == 2


def test_scan_limits_return_truncated_instead_of_crashing(tmp_path: Path) -> None:
    root = tmp_path / "large-repository"
    root.mkdir()
    for index in range(8):
        (root / f"file_{index}.py").write_text("pass\n", encoding="utf-8")
    scanner = RepositoryScanner(ScanLimits(3, 1024, 4096))

    scan = scanner.scan(SafePathResolver.select_workspace(str(root)))

    assert scan.scan_truncated is True
    assert scan.file_count == 3
    assert len(scan.files) == 3
