"""Strict unified-diff parsing and in-memory application without shell tools."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePosixPath


class UnifiedDiffError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class DiffHunk:
    old_start: int
    old_count: int
    new_start: int
    new_count: int
    lines: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ParsedUnifiedDiff:
    relative_path: str
    hunks: tuple[DiffHunk, ...]
    additions: int
    deletions: int


class UnifiedDiffParser:
    _hunk = re.compile(
        r"^@@ -(?P<old>\d+)(?:,(?P<old_count>\d+))? "
        r"\+(?P<new>\d+)(?:,(?P<new_count>\d+))? @@(?: .*)?$"
    )
    _forbidden = (
        "Binary files ",
        "GIT binary patch",
        "rename from ",
        "rename to ",
        "deleted file mode ",
        "new file mode ",
    )

    def parse(self, raw: str) -> ParsedUnifiedDiff:
        if any(marker in raw for marker in self._forbidden):
            raise UnifiedDiffError("Binary, rename, create, and delete patches are not allowed.")
        lines = raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        if lines and lines[-1] == "":
            lines.pop()
        if len(lines) < 3 or not lines[0].startswith("--- ") or not lines[1].startswith("+++ "):
            raise UnifiedDiffError("Unified diff must start with --- and +++ headers.")
        old_path = self._path(lines[0][4:], "a/")
        new_path = self._path(lines[1][4:], "b/")
        if old_path != new_path:
            raise UnifiedDiffError("Rename or multi-target diffs are not allowed.")
        hunks: list[DiffHunk] = []
        index = 2
        additions = 0
        deletions = 0
        while index < len(lines):
            match = self._hunk.match(lines[index])
            if match is None:
                raise UnifiedDiffError("Malformed unified-diff hunk header.")
            index += 1
            hunk_lines: list[str] = []
            while index < len(lines) and not lines[index].startswith("@@ "):
                line = lines[index]
                if line == "\\ No newline at end of file":
                    index += 1
                    continue
                if not line or line[0] not in {" ", "+", "-"}:
                    raise UnifiedDiffError(
                        "Every hunk line must be context, addition, or deletion."
                    )
                hunk_lines.append(line)
                additions += line.startswith("+")
                deletions += line.startswith("-")
                index += 1
            old_count = int(match.group("old_count") or "1")
            new_count = int(match.group("new_count") or "1")
            actual_old = sum(line[0] in {" ", "-"} for line in hunk_lines)
            actual_new = sum(line[0] in {" ", "+"} for line in hunk_lines)
            if old_count != actual_old or new_count != actual_new:
                raise UnifiedDiffError("Hunk line counts do not match its header.")
            hunks.append(
                DiffHunk(
                    old_start=int(match.group("old")),
                    old_count=old_count,
                    new_start=int(match.group("new")),
                    new_count=new_count,
                    lines=tuple(hunk_lines),
                )
            )
        if not hunks or additions + deletions == 0:
            raise UnifiedDiffError("Patch must contain at least one changed line.")
        return ParsedUnifiedDiff(old_path, tuple(hunks), additions, deletions)

    def apply(self, parsed: ParsedUnifiedDiff, original: str) -> str:
        newline = "\r\n" if "\r\n" in original else "\n"
        final_newline = original.endswith(("\n", "\r"))
        source = original.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        if final_newline:
            source.pop()
        result: list[str] = []
        cursor = 0
        for hunk in parsed.hunks:
            start = hunk.old_start - 1
            if start < cursor or start > len(source):
                raise UnifiedDiffError("Hunk range is outside the source file.")
            result.extend(source[cursor:start])
            cursor = start
            for line in hunk.lines:
                prefix, value = line[0], line[1:]
                if prefix in {" ", "-"}:
                    if cursor >= len(source) or source[cursor] != value:
                        raise UnifiedDiffError("Hunk context does not match the current file.")
                    cursor += 1
                if prefix in {" ", "+"}:
                    result.append(value)
        result.extend(source[cursor:])
        rendered = newline.join(result)
        return rendered + newline if final_newline else rendered

    @staticmethod
    def _path(value: str, prefix: str) -> str:
        if "\t" in value or " " in value:
            raise UnifiedDiffError("Diff paths may not contain timestamps or spaces.")
        if value == "/dev/null" or not value.startswith(prefix):
            raise UnifiedDiffError("Only existing a/ and b/ file paths are allowed.")
        relative = value[len(prefix) :].replace("\\", "/")
        path = PurePosixPath(relative)
        if path.is_absolute() or ".." in path.parts or not relative:
            raise UnifiedDiffError("Diff target escapes the workspace.")
        return path.as_posix()
