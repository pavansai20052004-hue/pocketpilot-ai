"""Deterministic parsing of pasted Java, Python, JavaScript, and TypeScript errors."""

import re
from pathlib import PurePosixPath

from pocketpilot_agent.models import ErrorFrame, ParsedError


class ErrorParser:
    """Extract stable facts without model inference."""

    _java_frame = re.compile(
        r"\bat\s+(?P<symbol>[\w.$<>]+)\((?P<path>[^():]+\.java):(?P<line>\d+)\)"
    )
    _python_frame = re.compile(
        r'\bFile[ \t]*"(?P<path>[^"\r\n]+\.py)"[ \t]*,[ \t]*line[ \t]+(?P<line>\d+)'
        r'(?:[ \t]*,[ \t]*in[ \t]+(?P<symbol>\S+))?'
    )
    _pytest_frame = re.compile(
        r'^[ \t]*(?P<path>[^\r\n]+?\.py):[ \t]*(?P<line>\d+):[ \t]*in[ \t]+(?P<symbol>\w+)[ \t]*$',
        re.MULTILINE,
    )
    _js_frame = re.compile(
        r"(?:\bat\s+(?:(?P<symbol>[\w.$<>]+)\s+\()?)(?P<path>[^\s():]+\.(?:[cm]?[jt]sx?)):(?P<line>\d+)(?::\d+)?\)?"
    )

    def parse(
        self,
        raw_text: str,
        language_hint: str | None = None,
        framework_hint: str | None = None,
    ) -> ParsedError:
        text = raw_text.strip()
        frames: list[ErrorFrame] = []
        language = self._language(text, language_hint)
        patterns = (
            ("Java", self._java_frame),
            ("Python", self._python_frame),
            ("Python", self._pytest_frame),
            ("JavaScript/TypeScript", self._js_frame),
        )
        for pattern_language, pattern in patterns:
            for match in pattern.finditer(text):
                path = match.groupdict().get("path")
                frames.append(
                    ErrorFrame(
                        path=self._normalize_path(path) if path else None,
                        line=int(match.group("line")),
                        symbol=match.groupdict().get("symbol"),
                    )
                )
            if frames and not language_hint:
                language = pattern_language
                break
        exception_type, message = self._headline(text)
        return ParsedError(
            language=language,
            framework=self._framework(text, framework_hint),
            package_or_module=self._package_or_module(frames),
            exception_type=exception_type,
            message=message,
            frames=frames[:30],
        )

    @staticmethod
    def _language(text: str, hint: str | None) -> str:
        if hint and hint.strip():
            return hint.strip()[:100]
        if "Traceback (most recent call last)" in text or re.search(r'File ".+\.py"', text):
            return "Python"
        if re.search(r"\bat\s+[\w.$]+\([^)]*\.java:\d+\)", text):
            return "Java"
        if re.search(r"\.(?:js|jsx|ts|tsx):\d+", text):
            return "JavaScript/TypeScript"
        return "Unknown"

    @staticmethod
    def _headline(text: str) -> tuple[str | None, str]:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        for line in reversed(lines):
            match = re.match(
                r"(?P<kind>[\w.$]*(?:Error|Exception|Failure))(?::\s*)?"
                r"(?P<message>.*)",
                line,
            )
            if match:
                return match.group("kind"), (match.group("message") or line)[:1000]
        first = lines[0] if lines else "Unclassified error"
        return None, first[:1000]

    @staticmethod
    def _framework(text: str, hint: str | None) -> str | None:
        if hint and hint.strip():
            return hint.strip()[:100]
        lowered = text.casefold()
        for marker, framework in (
            ("org.springframework", "Spring"),
            ("react", "React"),
            ("vite", "Vite"),
            ("django", "Django"),
            ("flask", "Flask"),
            ("node:internal", "Node.js"),
        ):
            if marker in lowered:
                return framework
        return None

    @staticmethod
    def _package_or_module(frames: list[ErrorFrame]) -> str | None:
        for frame in frames:
            if frame.symbol and "." in frame.symbol:
                return frame.symbol.split(".", maxsplit=1)[0]
            if frame.path and "/" in frame.path:
                return frame.path.rsplit("/", maxsplit=1)[0]
        return None

    @staticmethod
    def _normalize_path(path: str) -> str:
        return str(PurePosixPath(path.replace("\\", "/")))
