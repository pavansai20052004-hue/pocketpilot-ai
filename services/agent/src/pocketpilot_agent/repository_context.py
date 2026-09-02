"""Deterministic, budgeted repository context selection."""

from dataclasses import dataclass
from pathlib import PurePosixPath

from pocketpilot_agent.models import ContextFileSummary, FileCategory, ParsedError, RepositoryFile
from pocketpilot_agent.security import RepositorySecurityPolicy
from pocketpilot_agent.workspace import WorkspaceService


@dataclass(frozen=True, slots=True)
class ContextFile:
    summary: ContextFileSummary
    content: str


@dataclass(frozen=True, slots=True)
class RepositoryContextSelection:
    files: list[ContextFile]
    truncated: bool
    total_chars: int


class RepositoryContextService:
    """Read only scored line windows from the already indexed safe workspace."""

    def __init__(
        self,
        workspace_service: WorkspaceService,
        *,
        max_files: int,
        max_chars: int,
        max_lines_per_file: int,
    ) -> None:
        self.workspace_service = workspace_service
        self.max_files = max_files
        self.max_chars = max_chars
        self.max_lines_per_file = max_lines_per_file
        self.policy = RepositorySecurityPolicy()

    def collect(
        self,
        parsed: ParsedError,
        file_hint: str | None = None,
    ) -> RepositoryContextSelection:
        selected = self.workspace_service.selected_for_analysis()
        candidates: list[tuple[int, str, RepositoryFile, int | None]] = []
        references = [(frame.path, frame.line) for frame in parsed.frames if frame.path]
        if file_hint and file_hint.strip():
            references.insert(0, (file_hint.strip().replace("\\", "/"), None))
        for item in selected.scan.files:
            if item.category not in {
                FileCategory.SOURCE,
                FileCategory.TEST,
                FileCategory.CONFIG,
                FileCategory.BUILD,
            }:
                continue
            if self.policy.is_sensitive_file(PurePosixPath(item.relative_path).name):
                continue
            if self.policy.is_blocked_binary_or_archive(PurePosixPath(item.relative_path)):
                continue
            score, reason, line = self._score(item, references, parsed.language)
            if score > 0:
                candidates.append((score, reason, item, line))
        candidates.sort(key=lambda value: (-value[0], value[2].relative_path.casefold()))

        results: list[ContextFile] = []
        remaining = self.max_chars
        for score, reason, item, requested_line in candidates:
            if len(results) >= self.max_files or remaining <= 0:
                break
            path = selected.resolver.resolve_relative(item.relative_path)
            if not path.is_file() or self.policy.is_reparse_point(path):
                continue
            raw = path.read_text(encoding="utf-8", errors="replace")
            if "\x00" in raw:
                continue
            lines = raw.splitlines()
            if not lines:
                lines = [""]
            start, end = self._window(len(lines), requested_line)
            numbered = "\n".join(
                f"{index + 1:>6} | {lines[index]}" for index in range(start - 1, end)
            )
            content = numbered[:remaining]
            if not content:
                break
            results.append(
                ContextFile(
                    summary=ContextFileSummary(
                        relative_path=item.relative_path,
                        language=item.language,
                        line_start=start,
                        line_end=end,
                        score=score,
                        reason=reason,
                    ),
                    content=content,
                )
            )
            remaining -= len(content)
        return RepositoryContextSelection(
            files=results,
            truncated=len(results) < len(candidates),
            total_chars=sum(len(item.content) for item in results),
        )

    def _score(
        self,
        item: RepositoryFile,
        references: list[tuple[str | None, int | None]],
        language: str,
    ) -> tuple[int, str, int | None]:
        relative = item.relative_path.replace("\\", "/")
        basename = PurePosixPath(relative).name.casefold()
        best = 0
        reason = ""
        selected_line: int | None = None
        for raw_path, line in references:
            if not raw_path:
                continue
            reference = raw_path.replace("\\", "/").lstrip("./")
            if relative.casefold() == reference.casefold() or reference.casefold().endswith(
                "/" + relative.casefold()
            ):
                candidate, candidate_reason = 100, "exact stack-frame path"
            elif PurePosixPath(reference).name.casefold() == basename:
                candidate, candidate_reason = 80, "stack-frame basename"
            else:
                continue
            if candidate > best:
                best, reason, selected_line = candidate, candidate_reason, line
        if best == 0 and item.language and item.language.casefold() in language.casefold():
            if item.category is FileCategory.TEST:
                return 15, "language-matched test", None
            if item.category is FileCategory.SOURCE:
                return 20, "language-matched source", None
        return best, reason, selected_line

    def _window(self, total_lines: int, requested_line: int | None) -> tuple[int, int]:
        window = max(1, self.max_lines_per_file)
        if requested_line is None:
            return 1, min(total_lines, window)
        center = min(max(requested_line, 1), total_lines)
        start = max(1, center - window // 2)
        end = min(total_lines, start + window - 1)
        start = max(1, end - window + 1)
        return start, end
