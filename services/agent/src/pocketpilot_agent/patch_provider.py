"""Patch-generation providers that can propose text but never access the filesystem."""

from __future__ import annotations

import asyncio
import json
from typing import Protocol

from pocketpilot_agent.analysis_prompts import PromptBundle
from pocketpilot_agent.analysis_provider import AnalysisProviderError, LLMProvider
from pocketpilot_agent.models import AnalysisStatus
from pocketpilot_agent.patch_prompts import PatchPrompt, PatchSourceFile


class PatchProvider(Protocol):
    name: str
    model: str

    async def generate(self, prompt: PatchPrompt, files: list[PatchSourceFile]) -> str: ...


class MockPatchProvider:
    name = "mock"
    model = "deterministic-patch-v1"

    def __init__(self, response: str | None = None, delay_seconds: float = 0) -> None:
        self.response = response
        self.delay_seconds = delay_seconds

    async def generate(self, prompt: PatchPrompt, files: list[PatchSourceFile]) -> str:
        del prompt
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)
        if self.response is not None:
            return self.response
        python = next(
            (item for item in files if item.relative_path.endswith("user_service.py")), None
        )
        if python is not None:
            diff = (
                "--- a/user_service.py\n"
                "+++ b/user_service.py\n"
                "@@ -3,3 +3,5 @@\n"
                " def get_user_name(user: dict[str, str] | None) -> str:\n"
                '     """Return the display name for a repository result."""\n'
                "+    if user is None:\n"
                '+        return "Unknown"\n'
                '     return user["name"]\n'
            )
            return self._response(
                "Handle a missing user safely",
                "Return the documented fallback for a missing repository result.",
                python.relative_path,
                diff,
            )
        react = next(
            (item for item in files if item.relative_path.endswith("UserProfile.tsx")), None
        )
        if react is not None:
            diff = (
                f"--- a/{react.relative_path}\n"
                f"+++ b/{react.relative_path}\n"
                "@@ -9,5 +9,8 @@\n"
                " }\n"
                " \n"
                " export function UserProfile({ user }: UserProfileProps): ReactElement {\n"
                "+  if (user === null) {\n"
                "+    return <h1>Guest</h1>;\n"
                "+  }\n"
                "   return <h1>{user.name}</h1>;\n"
                " }\n"
            )
            return self._response(
                "Render a safe profile fallback",
                "Render Guest while nullable user data is unavailable.",
                react.relative_path,
                diff,
            )
        java = next(
            (item for item in files if item.relative_path.endswith("UserService.java")), None
        )
        if java is None:
            raise AnalysisProviderError(
                AnalysisStatus.INVALID_RESPONSE,
                "Mock patch provider has no deterministic mapping for this fixture.",
            )
        diff = (
            f"--- a/{java.relative_path}\n"
            f"+++ b/{java.relative_path}\n"
            "@@ -10,4 +10,7 @@\n"
            "     public String displayName(long id) {\n"
            "         User user = repository.findById(id);\n"
            "+        if (user == null) {\n"
            '+            return "Unknown";\n'
            "+        }\n"
            "         return user.name();\n"
            "     }\n"
        )
        return self._response(
            "Handle a missing user safely",
            "Avoid dereferencing a nullable repository result.",
            java.relative_path,
            diff,
        )

    @staticmethod
    def _response(title: str, summary: str, path: str, diff: str) -> str:
        return json.dumps(
            {
                "title": title,
                "summary": summary,
                "rationale": "The validated root cause identifies a missing-value dereference.",
                "confidence": "HIGH",
                "files": [
                    {
                        "relative_path": path,
                        "unified_diff": diff,
                        "explanation": "Guard the nullable value before dereferencing it.",
                    }
                ],
                "expected_effect": "The missing-user case returns a stable fallback.",
                "risks": ["Changes behavior only for a missing user."],
                "validation_notes": ["Run the existing allowlisted test command."],
            }
        )


class OllamaPatchProvider:
    def __init__(self, provider: LLMProvider) -> None:
        self.provider = provider
        self.name = provider.name
        self.model = provider.model

    async def generate(self, prompt: PatchPrompt, files: list[PatchSourceFile]) -> str:
        del files
        return await self.provider.complete(
            PromptBundle(system=prompt.system, user=prompt.user)
        )
