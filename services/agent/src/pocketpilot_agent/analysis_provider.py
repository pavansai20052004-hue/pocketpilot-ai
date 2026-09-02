"""Local-only model provider boundary with deterministic mock support."""

from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Protocol

import httpx

from pocketpilot_agent.analysis_prompts import PromptBundle
from pocketpilot_agent.models import AnalysisStatus, ProviderHealth


class AnalysisProviderError(RuntimeError):
    def __init__(self, status: AnalysisStatus, detail: str) -> None:
        super().__init__(detail)
        self.status = status


class LLMProvider(Protocol):
    name: str
    model: str

    async def health(self) -> ProviderHealth: ...

    async def complete(self, prompt: PromptBundle) -> str: ...


class MockLLMProvider:
    """Predictable offline provider used by tests and the zero-setup demo."""

    name = "mock"
    model = "deterministic-root-cause-v1"

    def __init__(self, response: str | None = None, failure: AnalysisStatus | None = None) -> None:
        self.response = response
        self.failure = failure
        self.call_count = 0

    async def health(self) -> ProviderHealth:
        return ProviderHealth(
            provider=self.name,
            model=self.model,
            status=None,
            available=True,
            model_available=True,
            latency_ms=0,
            detail="Deterministic offline analysis provider is ready.",
        )

    async def complete(self, prompt: PromptBundle) -> str:
        self.call_count += 1
        if self.failure is AnalysisStatus.TIMEOUT:
            raise AnalysisProviderError(self.failure, "The local model timed out.")
        if self.failure is not None:
            raise AnalysisProviderError(
                self.failure, "The configured local provider is unavailable."
            )
        if self.response is not None:
            return self.response
        path_match = re.search(r'"relative_path":\s*"([^"]+)"', prompt.user)
        line_match = re.search(r'"line":\s*(\d+)', prompt.user)
        symbol_match = re.search(r'"symbol":\s*"([^"]+)"', prompt.user)
        exception_match = re.search(r'"exception_type":\s*"([^"]+)"', prompt.user)
        path = path_match.group(1) if path_match else None
        line = int(line_match.group(1)) if line_match else None
        symbol = symbol_match.group(1) if symbol_match else None
        exception = exception_match.group(1) if exception_match else "runtime error"
        is_null = "NullPointerException" in prompt.user or "null" in prompt.user.casefold()
        cause = (
            "A nullable value is dereferenced without checking that a value was returned."
            if is_null
            else (
                f"The failure originates in the reported {exception} path; inspect the "
                "cited expression and its inputs."
            )
        )
        evidence = (
            []
            if path is None
            else [
                {
                    "relative_path": path,
                    "line": line,
                    "observation": "The reported frame resolves to this bounded source window.",
                }
            ]
        )
        return json.dumps(
            {
                "summary": f"{exception} traced to the reported application frame.",
                "root_cause": cause,
                "explanation": (
                    "The error frame and selected source window point to the dereference site."
                ),
                "repair_strategy": "Validate the lookup result before dereferencing it.",
                "assumptions": [],
                "confidence": "HIGH" if path else "LOW",
                "likely_file": path,
                "likely_line": line,
                "likely_symbol": symbol,
                "evidence": evidence,
                "related_files": [path] if path else [],
                "warnings": [] if path else ["No repository file matched the pasted error."],
            }
        )


class OllamaLLMProvider:
    """HTTP adapter for an already-running local Ollama service."""

    name = "ollama"

    def __init__(self, base_url: str, model: str, timeout_seconds: float) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds

    async def health(self) -> ProviderHealth:
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=min(self.timeout_seconds, 5.0)) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                models = response.json().get("models", [])
        except (httpx.HTTPError, ValueError, TypeError):
            return ProviderHealth(
                provider=self.name,
                model=self.model,
                status=AnalysisStatus.PROVIDER_UNAVAILABLE,
                available=False,
                model_available=False,
                latency_ms=round((time.perf_counter() - started) * 1000),
                detail="Ollama is not reachable at the configured local URL.",
            )
        names = {item.get("name") for item in models if isinstance(item, dict)}
        if self.model not in names:
            return ProviderHealth(
                provider=self.name,
                model=self.model,
                status=AnalysisStatus.MODEL_NOT_FOUND,
                available=False,
                model_available=False,
                latency_ms=round((time.perf_counter() - started) * 1000),
                detail="The configured model is not installed. PocketPilot will not download it.",
            )
        return ProviderHealth(
            provider=self.name,
            model=self.model,
            status=None,
            available=True,
            model_available=True,
            latency_ms=round((time.perf_counter() - started) * 1000),
            detail="Ollama and the configured local model are ready.",
        )

    async def complete(self, prompt: PromptBundle) -> str:
        health = await self.health()
        if not health.available:
            raise AnalysisProviderError(
                health.status or AnalysisStatus.PROVIDER_UNAVAILABLE, health.detail
            )
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "stream": False,
                        "format": "json",
                        "messages": [
                            {"role": "system", "content": prompt.system},
                            {"role": "user", "content": prompt.user},
                        ],
                        "options": {"temperature": 0},
                    },
                )
                response.raise_for_status()
                content = response.json()["message"]["content"]
        except httpx.TimeoutException as exc:
            raise AnalysisProviderError(
                AnalysisStatus.TIMEOUT, "The local model timed out."
            ) from exc
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
            raise AnalysisProviderError(
                AnalysisStatus.PROVIDER_UNAVAILABLE,
                "The local Ollama request failed.",
            ) from exc
        if not isinstance(content, str):
            raise AnalysisProviderError(
                AnalysisStatus.INVALID_RESPONSE, "Ollama returned a non-text response."
            )
        return content


def build_provider(name: str, base_url: str, model: str, timeout_seconds: float) -> LLMProvider:
    normalized = name.strip().casefold()
    if normalized == "mock":
        return MockLLMProvider()
    if normalized == "ollama":
        return OllamaLLMProvider(base_url, model, timeout_seconds)
    raise ValueError("POCKETPILOT_ANALYSIS_PROVIDER must be 'mock' or 'ollama'.")


async def complete_with_timeout(
    provider: LLMProvider, prompt: PromptBundle, timeout_seconds: float
) -> str:
    try:
        return await asyncio.wait_for(provider.complete(prompt), timeout=timeout_seconds)
    except TimeoutError as exc:
        raise AnalysisProviderError(AnalysisStatus.TIMEOUT, "The local model timed out.") from exc
