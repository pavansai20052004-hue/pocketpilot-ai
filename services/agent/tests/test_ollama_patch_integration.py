"""Explicit opt-in check for patch JSON from an existing local Ollama model."""

import os

import anyio
import pytest

from pocketpilot_agent.analysis_provider import OllamaLLMProvider
from pocketpilot_agent.models import PatchProviderOutput
from pocketpilot_agent.patch_prompts import PatchPrompt, PatchSourceFile
from pocketpilot_agent.patch_provider import OllamaPatchProvider


@pytest.mark.skipif(
    os.environ.get("POCKETPILOT_RUN_OLLAMA_TESTS") != "1",
    reason="Set POCKETPILOT_RUN_OLLAMA_TESTS=1 to use a preinstalled local model.",
)
def test_configured_ollama_returns_structured_patch() -> None:
    model = os.environ.get("POCKETPILOT_OLLAMA_MODEL", "").strip()
    if not model:
        pytest.skip("POCKETPILOT_OLLAMA_MODEL is not configured.")
    base = OllamaLLMProvider(
        os.environ.get("POCKETPILOT_OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
        model,
        float(os.environ.get("POCKETPILOT_OLLAMA_TIMEOUT_SECONDS", "45")),
    )
    health = anyio.run(base.health)
    if not health.available:
        pytest.skip(health.detail)
    provider = OllamaPatchProvider(base)
    source = PatchSourceFile(
        relative_path="service.py",
        content='def name(user):\n    return user["name"]\n',
        sha256="fixture",
        line_start=1,
        line_end=2,
    )
    prompt = PatchPrompt(
        system=(
            "Return JSON with title, summary, rationale, confidence, files, expected_effect, "
            "risks, validation_notes. Each file contains relative_path, unified_diff, explanation."
        ),
        user="Fix the None dereference in the supplied service.py using one minimal diff.",
    )

    raw = anyio.run(provider.generate, prompt, [source])

    assert PatchProviderOutput.model_validate_json(raw).files
