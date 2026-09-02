from pathlib import Path

from pocketpilot_agent.config import Settings
from pocketpilot_agent.error_parser import ErrorParser
from pocketpilot_agent.repository_context import RepositoryContextService
from pocketpilot_agent.workspace import WorkspaceService


def build_context(root: Path) -> RepositoryContextService:
    workspace = WorkspaceService(Settings())
    workspace.inspect(str(root))
    return RepositoryContextService(
        workspace, max_files=2, max_chars=700, max_lines_per_file=6
    )


def test_context_prefers_stack_file_and_enforces_line_budget(java_project: Path) -> None:
    parsed = ErrorParser().parse(
        "java.lang.NullPointerException\n"
        "at demo.UserService.displayName(UserService.java:12)"
    )

    selection = build_context(java_project).collect(parsed)
    context = selection.files

    assert context[0].summary.relative_path.endswith("UserService.java")
    assert context[0].summary.line_start <= 12 <= context[0].summary.line_end
    assert context[0].summary.line_end - context[0].summary.line_start + 1 <= 6
    assert sum(len(item.content) for item in context) <= 700


def test_context_never_reads_sensitive_or_ignored_files(python_project: Path) -> None:
    parsed = ErrorParser().parse("RuntimeError: DEMO_SECRET private.key ignored.js")

    context = build_context(python_project).collect(parsed, file_hint=".env").files

    paths = [item.summary.relative_path for item in context]
    assert ".env" not in paths
    assert "private.key" not in paths
    assert not any("node_modules" in path for path in paths)
    assert all("never-read" not in item.content for item in context)


def test_explicit_path_outranks_duplicate_basename(java_project: Path) -> None:
    duplicate = java_project / "src" / "test" / "java" / "demo" / "UserService.java"
    duplicate.parent.mkdir(parents=True)
    duplicate.write_text("class UserService {}\n", encoding="utf-8")
    service = build_context(java_project)
    parsed = ErrorParser().parse("NullPointerException in UserService.java:12")

    context = service.collect(
        parsed, file_hint="src/main/java/demo/UserService.java"
    ).files

    assert context[0].summary.relative_path == "src/main/java/demo/UserService.java"
    assert context[0].summary.score == 100
