# Presentation Mode

Presentation Mode is a judge-focused view over PocketPilot's real workflow. It does not bypass authentication, analysis, patch validation, human approval, tests, or rollback.

## Mobile

- Enabled by default; toggle it in Settings.
- Shows the product promise, compact laptop/workspace/provider/camera/voice readiness, and **Scan Error** as the primary action.
- Keeps **Speak Command** and **Paste Error** visible as equal-backend fallbacks.
- Separates **New Session** from **Reset Demo**.
- Uses concise root-cause evidence, readable diffs, an explicit **Ready to Apply** confirmation, live test progress, and a provider-truthful **Fix Verified** state.

## Desktop judge view

- Shows live phone, workspace, provider, and session status above the fold at 1366×768.
- Displays registered scenarios and one safe **Prepare Demo** action.
- Shows an event-backed architecture path and expandable technical details.
- Hides repository inspection and raw development controls until Development Mode is selected.
- Keeps failures and readiness warnings visible.

## Prepare Demo

The request contains only a registered demo ID. The laptop restores that demo's canonical broken file, runs its registered validation to reproduce the expected failure, selects the workspace, checks provider/tool readiness, and returns `READY_FOR_NEXT_DEMO`. It does not change firewall settings, install software, download models, or touch arbitrary paths.

## Provider language

- `ollama`: **Ollama · model-name** and local only when the provider health check succeeds.
- `mock`: **Deterministic Demo Provider**. Never describe it as a model or real local AI.
- Android speech: **Android Service · may require network** unless the phone verifies offline recognition.

## Recovery promise

Sessions are persisted by the laptop. The phone reconciles the latest meaningful session on startup/foreground, so a disconnect during analysis or tests does not repeat an approval or validation run. Revision and operation locks reject duplicate or stale mutations.
