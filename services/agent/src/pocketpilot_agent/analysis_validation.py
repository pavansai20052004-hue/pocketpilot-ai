"""Schema and repository-reference validation for untrusted model output."""

import json

from pydantic import ValidationError

from pocketpilot_agent.models import AnalysisConfidence, AnalysisResult
from pocketpilot_agent.repository_context import ContextFile


class InvalidAnalysisResponseError(ValueError):
    """Raised when provider text is not a usable structured analysis."""


class AnalysisResultValidator:
    def validate(self, raw: str, context: list[ContextFile]) -> AnalysisResult:
        try:
            payload = json.loads(self._json_text(raw))
            result = AnalysisResult.model_validate(payload)
        except (json.JSONDecodeError, ValidationError, TypeError) as exc:
            raise InvalidAnalysisResponseError(
                "Model output did not match the analysis schema."
            ) from exc
        windows = {
            item.summary.relative_path: (item.summary.line_start, item.summary.line_end)
            for item in context
        }
        warnings = list(result.warnings)
        invalid_reference = False
        likely_file = result.likely_file
        likely_line = result.likely_line
        if likely_file not in windows:
            if likely_file is not None:
                warnings.append("The model's likely file was not present in bounded context.")
                invalid_reference = True
            likely_file, likely_line = None, None
        elif likely_line is not None:
            start, end = windows[likely_file]
            if not start <= likely_line <= end:
                warnings.append("The model's likely line was outside the selected source window.")
                likely_line = None
                invalid_reference = True
        evidence = []
        for item in result.evidence:
            window = windows.get(item.relative_path)
            if window is None or (
                item.line is not None and not window[0] <= item.line <= window[1]
            ):
                invalid_reference = True
                continue
            evidence.append(item)
        related = [path for path in result.related_files if path in windows]
        if len(related) != len(result.related_files):
            invalid_reference = True
        confidence = result.confidence
        if invalid_reference:
            confidence = AnalysisConfidence.LOW if not evidence else AnalysisConfidence.MEDIUM
            warnings.append("Unsupported repository references were removed during validation.")
        return result.model_copy(
            update={
                "likely_file": likely_file,
                "likely_line": likely_line,
                "evidence": evidence,
                "related_files": list(dict.fromkeys(related)),
                "warnings": list(dict.fromkeys(warnings))[:12],
                "confidence": confidence,
            }
        )

    @staticmethod
    def _json_text(raw: str) -> str:
        value = raw.strip()
        if value.startswith("```") and value.endswith("```"):
            lines = value.splitlines()
            value = "\n".join(lines[1:-1]).strip()
        return value
