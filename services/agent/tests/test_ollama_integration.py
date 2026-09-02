"""Explicit opt-in smoke test for an already-installed Ollama model."""

import os
from pathlib import Path

import anyio
import pytest

from pocketpilot_agent.analysis_prompts import AnalysisPromptBuilder
from pocketpilot_agent.analysis_provider import OllamaLLMProvider
from pocketpilot_agent.models import ParsedError


@pytest.mark.skipif(
    os.environ.get("POCKETPILOT_RUN_OLLAMA_TESTS") != "1",
    reason="Set POCKETPILOT_RUN_OLLAMA_TESTS=1 to use a preinstalled local model.",
)
def test_configured_ollama_returns_text(tmp_path: Path) -> None:
    del tmp_path
    model = os.environ.get("POCKETPILOT_OLLAMA_MODEL", "").strip()
    if not model:
        pytest.skip("POCKETPILOT_OLLAMA_MODEL is not configured.")
    provider = OllamaLLMProvider(
        os.environ.get("POCKETPILOT_OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
        model,
        float(os.environ.get("POCKETPILOT_OLLAMA_TIMEOUT_SECONDS", "45")),
    )
    health = anyio.run(provider.health)
    if not health.available:
        pytest.skip(health.detail)
    prompt = AnalysisPromptBuilder().build(
        ParsedError(
            language="Java",
            exception_type="NullPointerException",
            message="user is null",
            frames=[],
        ),
        "NullPointerException: user is null",
        [],
    )

    response = anyio.run(provider.complete, prompt)

    assert response.strip()
