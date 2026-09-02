# Local AI analysis

Milestone 3 is diagnosis-only. It accepts pasted text, extracts deterministic error facts, selects small safe source windows, calls a local provider, validates the response, and persists a concise root cause. It cannot write code, generate/apply a patch, or run a command.

## Providers

`LLMProvider` isolates orchestration from implementations:

- `mock` is the default. It is deterministic, offline, visibly labeled, and intended for tests, demos, failure simulation, and frontend development.
- `ollama` calls an already-running Ollama HTTP API on loopback by default. PocketPilot checks `/api/tags`, reports missing runtimes/models, and never pulls or downloads a model.

Configuration:

```dotenv
POCKETPILOT_LLM_PROVIDER=ollama
POCKETPILOT_OLLAMA_BASE_URL=http://127.0.0.1:11434
POCKETPILOT_OLLAMA_MODEL=qwen2.5-coder:7b
POCKETPILOT_OLLAMA_TIMEOUT_SECONDS=45
```

Choose a coding-capable model already present on the machine. Supported failure statuses are `PROVIDER_UNAVAILABLE`, `MODEL_NOT_FOUND`, `TIMEOUT`, and `INVALID_RESPONSE`.

## Context selection

The selector ranks exact stack paths, basename matches, referenced lines, language-matched source, and tests. It reads numbered windows, not whole repositories. Defaults are configurable with `POCKETPILOT_ANALYSIS_MAX_CONTEXT_FILES` (6), `POCKETPILOT_ANALYSIS_MAX_CONTEXT_CHARS` (24000), and `POCKETPILOT_ANALYSIS_MAX_LINES_PER_FILE` (80).

The original scanner/security policy remains authoritative. Environment files, credentials, keys, binaries, generated output, ignored directories, symlinks/reparse points, and paths outside the selected workspace are unavailable. Analysis metadata reports when the candidate set exceeded its context budget.

## Output validation and recovery

Prompts separate system rules from `<UNTRUSTED_ERROR>` and `<UNTRUSTED_REPOSITORY_CONTEXT>` blocks. The system rules prohibit instructions from source text, invented facts, commands, patches, scripts, modifications, and hidden reasoning.

Provider text is parsed into strict JSON and a Pydantic `AnalysisResult`. File and line references must exist in the exact supplied windows. Unsupported claims are removed, confidence is downgraded, and a warning is attached. If JSON is malformed, PocketPilot permits one constrained reformat call. A second invalid response becomes `INVALID_RESPONSE`; this formatting attempt does not consume or bypass the session's separate two-retry policy.

Only validated conclusions, evidence, context-window metadata, and parse/context/provider/validation/total timings are stored. Raw model text, raw source windows, and chain-of-thought are not persisted.

## Optional Ollama test

Normal tests use the mock and never require Ollama. To opt in with an existing configured model:

```powershell
$env:POCKETPILOT_RUN_OLLAMA_TESTS='1'
$env:POCKETPILOT_OLLAMA_MODEL='your-installed-model:tag'
.\.venv\Scripts\python -m pytest services/agent/tests/test_ollama_integration.py -ra
```

If Ollama or the model is unavailable, the test skips cleanly. Do not install or pull a model as part of verification.
