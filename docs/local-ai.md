# Local AI analysis

Milestone 3 analysis remains diagnosis-only. Milestone 4 adds a separate patch provider whose output is always untrusted and cannot write files. See [patch-engine.md](patch-engine.md) for the approval and mutation boundary.

## Providers

`LLMProvider` isolates orchestration from implementations:

- `mock` is the default. It is deterministic, offline, visibly labeled, and intended for tests, demos, failure simulation, and frontend development.
- `ollama` calls an already-running Ollama HTTP API on loopback by default. PocketPilot checks `/api/tags`, reports missing runtimes/models, and never pulls or downloads a model.

Configuration:

```dotenv
POCKETPILOT_LLM_PROVIDER=ollama
POCKETPILOT_OLLAMA_BASE_URL=http://127.0.0.1:11434
POCKETPILOT_OLLAMA_MODEL=qwen3-coder:30b
POCKETPILOT_OLLAMA_TIMEOUT_SECONDS=300
POCKETPILOT_OLLAMA_CONTEXT_TOKENS=8192
POCKETPILOT_OLLAMA_MAX_OUTPUT_TOKENS=2048
POCKETPILOT_OLLAMA_KEEP_ALIVE=15m
```

Choose a coding-capable model already present on the machine. Supported failure statuses are `PROVIDER_UNAVAILABLE`, `MODEL_NOT_FOUND`, `TIMEOUT`, and `INVALID_RESPONSE`.

## Milestone 10 model selection

The measured development laptop has an AMD Ryzen 7 7445HS (6 cores/12 logical processors), 31.3 GB RAM, integrated Radeon 740M graphics with 0.5 GB reported dedicated adapter memory, 328.4 GB free disk, and 64-bit Windows 11. The selected model is [Qwen3-Coder 30B](https://ollama.com/library/qwen3-coder:30b): 30.5B total parameters, 3.3B active parameters, Q4_K_M quantization, and approximately 19 GB on disk.

This is a quality-first selection for structured debugging and code repair. It fits in system RAM with limited headroom and should be expected to run primarily on CPU/shared memory on this integrated-GPU laptop. PocketPilot limits each call to an 8K context because its own evidence budget is 24,000 characters, caps output at 2,048 tokens, and keeps the model loaded for 15 minutes between demo calls. The larger native model context is not claimed or required by this workflow.

## Context selection

The selector ranks exact stack paths, basename matches, referenced lines, language-matched source, and tests. It reads numbered windows, not whole repositories. Defaults are configurable with `POCKETPILOT_ANALYSIS_MAX_CONTEXT_FILES` (6), `POCKETPILOT_ANALYSIS_MAX_CONTEXT_CHARS` (24000), and `POCKETPILOT_ANALYSIS_MAX_LINES_PER_FILE` (80).

The original scanner/security policy remains authoritative. Environment files, credentials, keys, binaries, generated output, ignored directories, symlinks/reparse points, and paths outside the selected workspace are unavailable. Analysis metadata reports when the candidate set exceeded its context budget.

## Output validation and recovery

Prompts separate system rules from `<UNTRUSTED_ERROR>` and `<UNTRUSTED_REPOSITORY_CONTEXT>` blocks. The system rules prohibit instructions from source text, invented facts, commands, patches, scripts, modifications, and hidden reasoning.

Provider text is parsed into strict JSON and a Pydantic `AnalysisResult`. File and line references must exist in the exact supplied windows. Unsupported claims are removed, confidence is downgraded, and a warning is attached. If analysis JSON is malformed, PocketPilot permits one constrained reformat call. Patch output receives at most one bounded repair attempt when its JSON, schema, unified-diff structure, declared header path, applicability, or deterministic validation fails. The repair request is capped before it re-enters the 8K model context. The repaired proposal must pass the complete validator again; a second failure is rejected, no third model call occurs, and no repository write is possible. This formatting attempt does not consume or bypass the session's separate two-retry policy.

Only validated conclusions, evidence, context-window metadata, and parse/context/provider/validation/total timings are stored. Raw model text, raw source windows, and chain-of-thought are not persisted.

## Optional Ollama test

Normal tests use the mock and never require Ollama. To opt in with an existing configured model:

```powershell
$env:POCKETPILOT_RUN_OLLAMA_TESTS='1'
$env:POCKETPILOT_OLLAMA_MODEL='your-installed-model:tag'
.\.venv\Scripts\python -m pytest services/agent/tests/test_ollama_integration.py -ra
```

If Ollama or the model is unavailable, the test skips cleanly. Do not install or pull a model as part of verification.

The same opt-in flag covers Ollama patch JSON testing. Real patch output passes the identical schema, diff, path, hash, applicability, and risk validation used for deterministic mock proposals.

The mobile client keeps ordinary API requests on a short timeout, but gives local analysis up to 330 seconds and patch generation up to 630 seconds because generation may include the single repair call. Approval, real test execution, rejection, and rollback have a separate 90-second limit. These client limits do not weaken the agent's own per-call timeout or safety checks.

Run the five-cycle end-to-end Python reliability benchmark with:

```powershell
$env:POCKETPILOT_OLLAMA_MODEL='qwen3-coder:30b'
npm run demo:benchmark:ollama
```

The benchmark uses a disposable repository copy, never edits model output, applies only validated proposals, runs real pytest, rolls back, and verifies that the original failure returns after every successful cycle. A real model may be labeled the primary presentation provider only at 4/5 or better with no unsafe output escaping validation.

## Measured qualification result

On 2026-09-08, `qwen3-coder:30b` passed **5/5** consecutive Python cycles with no manual output edits. Every cycle identified `user_service.py:5` and the nullable dereference, cited repository evidence, produced a parsed and validated patch, passed real pytest, rolled back safely, and restored the original failure. Analysis provider latency was 44.659–48.347 seconds (46.406-second median). Patch generation was 63.669–156.773 seconds (67.174-second median); the longer cycles used the one bounded repair pass. The complete measured workflow, including rollback and restored-failure verification, was 114.532–207.510 seconds (117.756-second median).

This exceeds the defined 4/5 threshold, so real Ollama is the primary presentation provider and the visibly labeled deterministic provider is the low-latency backup. A temporary outbound firewall rule was attempted for external-network isolation, but Windows denied it without administrator rights. No rule remained. Loopback-only provider traffic is verified; a physically isolated network-off run is not claimed.
