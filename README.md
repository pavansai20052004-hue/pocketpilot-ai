# PocketPilot AI

**See it. Say it. Fix it.**

PocketPilot AI is a phone-first, local software-engineering assistant for the iQOO Hackathon 2026 Developer Tools track. A developer captures or pastes an error on their phone, reviews a proposed code diff, explicitly approves it, and watches a constrained laptop agent apply the change and run real tests.

Public product tour: **https://pocketpilot-ai.sleek-pearl-0098.chatgpt.site**. The public site is presentation-only; the agent, model, repository, device sessions, and patches remain local.

> Current phase: Hackathon Release Candidate. Official Ollama 0.33.3, local `qwen3-coder:30b`, Java 21, and Apache Maven 3.9.16 are installed and health-checked. The release matrix passes Python 5/5, Java 2/2, and React 2/2 deterministic repair/test/rollback cycles, plus 7/7 controlled real-Ollama Python cycles. The standalone APK completed a physical iQOO camera-to-real-Ollama repair, a post-restart text repair, real pytest verification, and rollback with Metro stopped. A controlled mobile-hotspot test also completed the entire local-AI workflow while 41 consecutive WAN checks remained unavailable. The real Java model attempt produced the correct diagnosis and evidence but its malformed patch was safely rejected. PocketPilot does not claim offline Android speech or an Office Kit integration.

## Foundation architecture

| Component | Technology | Current responsibility |
| --- | --- | --- |
| Phone client | Standalone Expo Android APK, React Native, TypeScript, ML Kit, Android SpeechRecognizer/TTS | Camera/gallery OCR, safe push-to-talk commands, authenticated debug, approval, verification, history, and rollback UI without Metro |
| Desktop dashboard | Vite, React, TypeScript | Workspace selection, pairing, device revocation, logs, and fallback UI |
| Local agent | FastAPI, Pydantic, Python | Secure repository actions, persistent sessions, bounded local analysis |
| Shared contracts | TypeScript package | Cross-client workspace, repository, and command contracts |

The final product will keep file access, patching, tests, model calls, and device transport behind explicit safety boundaries. See [architecture](docs/architecture.md), [delivery tasks](TASKS.md), and [judging mapping](docs/judging-mapping.md).

## Prerequisites

- Node.js 24+
- npm 11+
- Python 3.11+

## Install

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".\services\agent[dev]"
Copy-Item .env.example .env
```

If PowerShell cannot find Python but Codex workspace dependencies are installed, use their reported Python executable in place of `python`.

## Hackathon quick start

1. Run `npm run demo:check` and note any honest readiness warnings.
2. Run `npm run pocketpilot:start` to validate prerequisites, start only missing local services, open the production dashboard, and print a fresh phone pairing code.
3. Run `npm run demo:reset` to restore and verify every registered scenario.
4. Open `http://127.0.0.1:4173`, select **Python User Service**, and pair the phone.
5. Run the real failing pytest command, scan it, generate a fix, review, approve, and show the real passing validation.

Run `npm run demo:check` again after startup for the final green readiness view. Preflight never installs tools, pulls models, changes the firewall, or deletes files. See the [master script](docs/demo-script.md) and [recovery playbook](docs/demo-recovery.md).

Use `npm run pocketpilot:stop` to stop only processes owned and recorded by the release launcher; a pre-existing Ollama service and unrelated Node/Python programs are preserved. In the desktop Presentation Mode dashboard, choose **Python User Service → Prepare Demo**. This restores and verifies the registered broken state, selects the workspace, and refreshes the honest readiness result. See the [installation guide](docs/install.md), [presentation guide](docs/presentation-mode.md), and [event checklist](docs/hackathon-checklist.md).

## Start and pair

Use separate terminals from the repository root:

```powershell
npm run dev:mobile
```

```powershell
npm run dev:desktop
```

```powershell
.\.venv\Scripts\python -m uvicorn pocketpilot_agent.main:app --app-dir services/agent/src --reload --host 0.0.0.0 --port 8000
```

Use `127.0.0.1` instead of `0.0.0.0` when phone access is not needed. LAN mode authenticates every non-loopback workspace, session, analysis, patch, and WebSocket request. PocketPilot never changes Windows Firewall rules; approve a private-network firewall prompt manually only if you intend to connect a phone.

1. Open the dashboard URL printed by Vite and inspect one explicit workspace (for the demo, use `demo/python-broken-app`).
2. In **Device Connection**, generate a six-digit pairing code and note the displayed laptop address.
3. Start Expo, open it on Android, enter the address and code, and connect.
4. On the phone choose **Scan Error**, **Speak Command**, or **Paste Error**. Voice can request existing actions but cannot bypass review, confirmation, revisions, validation, or rollback protection.

The phone cannot browse or select laptop paths. Pairing codes expire after five minutes, allow five guesses, and are single-use. Android stores the opaque device token in Expo SecureStore; the laptop persists only its SHA-256 hash.

Camera OCR uses native code and therefore requires the standalone Android APK, not Expo Go. To produce the presentation APK from `apps/mobile`:

```powershell
npx eas-cli@latest login
npx eas-cli build --platform android --profile presentation
```

The physical phone installs the APK from the EAS build page and connects directly to the authenticated laptop agent on the same private Wi-Fi. Metro is not part of the standalone release flow. A local development workflow remains available separately. See [the vision debugger guide](docs/vision-debugger.md).

Voice recognition and TTS also use native modules and require rebuilding the standalone APK after native dependency/configuration changes. PocketPilot uses push-to-talk, shows the recognized transcript, deterministically resolves a closed intent, checks current session state, and asks for a second confirmation before approval or rollback. See [the voice engine guide](docs/voice-engine.md).

## Physical Android verification

The latest finished and physically inspected artifact is EAS presentation build `3fc84609-d3b0-4fbe-b4e4-71e24c053f7b`, version 1.0.2 / Android build 4. It includes the final PocketPilot identity, Android status-bar safe inset, narrow-phone header layout, and truthful animated progress for patch generation, application, and test execution. The standalone APK installed on the physical iQOO, launched without Metro, and completed camera, OCR, voice, approval, real pytest verification, and rollback. Presentation build 5 (`78f574bd-a52b-48ce-8992-d9f66fdf9e01`, version 1.0.3) adds the same dedicated progress experience to OCR analysis and is currently queued; it does not replace build 4 as the verified submission artifact until it finishes and receives a physical smoke test.

The presentation APK (EAS build `c9e3bde3-be24-44bf-a206-a1d37f3f6d38`, version 1.0.0 / Android build 2) installed and launched on the physical iQOO with Metro stopped. A fresh camera session used real `qwen3-coder:30b`, found `user_service.py:5` with high confidence, generated the genuine two-line guard, required phone approval, and passed real pytest 2/2. The backend recorded 65.140 seconds for analysis, 118.284 seconds for patch generation, 2 milliseconds for apply, and 675 milliseconds for verification. Actual wall time from session creation to success was 743.4 seconds because it includes deliberate human review pauses. Undo restored the exact original file and failing test.

A subsequent laptop/model cold restart required manual re-pairing rather than automatic phone recovery. After re-pairing, a text-input session again reached high-confidence `user_service.py:5`, generated and approved the patch, and passed 2/2 tests. Its measured processing was 48.343 seconds for analysis, 160.362 seconds for patch generation, 3 milliseconds for apply, and 1.115 seconds for pytest. This manual reconnect requirement is retained as a known limitation.

For controlled offline evidence, the phone hotspot stayed active while mobile data was disabled. The local verifier recorded 41 consecutive unavailable WAN checks for 207.384 seconds while `qwen3-coder:30b` completed correct analysis, validated patch generation, real pytest, rollback, and restored-failure verification in 205.220 seconds. Android speech was not part of that test and is not claimed offline.

Milestone 6 passed on a physical Android handset on 2026-09-04 using EAS development build `1a716796-9260-44bd-a463-80faed4dcceb`. The device model and Android version were not recorded, and no personal device identifier is stored.

- The app launched without a native-module crash, paired over private LAN, stored its token, and reconnected its authenticated WebSocket after a full app restart.
- Camera permission, live preview, flash toggle, portrait and landscape capture, preview, retake, rotate controls, guided crop, full-image preprocessing, and native ML Kit OCR ran on hardware.
- A physical photo of real pytest terminal output completed OCR in 375 ms and recovered 7/7 selected critical tokens: `TypeError`, `NoneType`, `user_service.py`, `5`, `test_missing_user_uses_fallback`, `get_user_name`, and `Unknown`.
- Confirmed camera text reached root cause, a one-file diff, explicit approval, a real `2 passed` result in 530 ms, and successful rollback to the original failing test.
- A blank capture returned `POOR · 0/100` in 830 ms, showed “No readable text was found,” and disabled analysis.
- Request inspection showed only user-confirmed text plus `CAMERA` provenance; no image bytes, Base64, multipart data, or camera URI reached the laptop.

## Desktop-agent API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/workspaces/inspect` | Select and inspect one explicit local root |
| `GET` | `/api/v1/workspaces/current` | Return current workspace metadata |
| `GET` | `/api/v1/workspaces/current/files` | Return the metadata-only file index |
| `GET` | `/api/v1/workspaces/current/commands` | Return applicable allowlisted actions |
| `POST` | `/api/v1/commands/{command_id}/run` | Explicitly execute one detected action |
| `GET` | `/api/v1/commands/runs/{run_id}` | Retrieve a completed structured result |
| `POST` | `/api/v1/devices/pairing-code` | Loopback-only: generate a short-lived code |
| `POST` | `/api/v1/devices/pair` | Exchange a code for an opaque device token |
| `GET` | `/api/v1/devices` | Loopback-only: list paired devices |
| `POST` | `/api/v1/devices/{device_id}/revoke` | Loopback-only: revoke a device immediately |
| `GET` | `/api/v1/demo/projects` | Run real health checks for registered demos |
| `POST` | `/api/v1/demo/select/{demo_id}` | Select one server-registered demo ID |
| `POST` | `/api/v1/demo/reset/{demo_id}` | Restore and verify one registered demo |
| `POST` | `/api/v1/demo/verify/{demo_id}` | Reproduce the expected real failure |
| `GET` | `/api/v1/demo/preflight` | Return honest agent/provider/demo readiness |

Session routes:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/sessions` | Create an `IDLE` session and its first event |
| `GET` | `/api/v1/sessions` | List recent local sessions |
| `GET` | `/api/v1/sessions/{id}` | Recover current state and revision |
| `POST` | `/api/v1/sessions/{id}/transitions` | Request one revision-checked legal transition |
| `GET` | `/api/v1/sessions/{id}/events` | Recover sequenced events after a cursor |
| WebSocket | `/api/v1/sessions/{id}/events/ws` | Receive a snapshot, missed events, then live events |
| `GET` | `/api/v1/analysis/provider` | Check local provider/model availability |
| `POST` | `/api/v1/sessions/{id}/analyze` | Parse, collect bounded context, and analyze text locally |
| `GET` | `/api/v1/sessions/{id}/analysis` | Retrieve the persisted validated result |
| `POST` | `/api/v1/sessions/{id}/patches/generate` | Generate and validate an untrusted diff proposal |
| `GET` | `/api/v1/sessions/{id}/patches/current` | Recover proposal, approval, test, and rollback status |
| `POST` | `/api/v1/sessions/{id}/patches/{patch_id}/approve` | Approve the exact revision-bound patch, apply, and verify |
| `POST` | `/api/v1/sessions/{id}/patches/{patch_id}/reject` | Reject without modifying files |
| `POST` | `/api/v1/sessions/{id}/patches/{patch_id}/rollback` | Restore the private snapshot when no conflict exists |

Session history is stored locally in `.pocketpilot/sessions.db` by default and is ignored by Git. Override it with `POCKETPILOT_SESSION_DATABASE_PATH`.

## Verify

```powershell
npm run check
.\.venv\Scripts\python -m ruff check services/agent
.\.venv\Scripts\python -m pytest services/agent
```

The mobile web export is a CI-friendly build check; Android remains the target product surface.

## Repository layout

```text
apps/
  mobile/          Expo phone client
  desktop-web/     Vite laptop dashboard
services/
  agent/           FastAPI local agent
packages/
  shared-types/    Strict TypeScript client contracts
demo/              Deterministic Python, Java, React, and OCR fixtures
docs/              Architecture and hackathon documentation
```

## Safety model

- Selection resolves one canonical workspace; child paths are rejected if they are absolute, traverse upward, or resolve outside it.
- Ignored dependencies/build trees and reparse/symlink directories are never traversed.
- Secret-like files appear only as `excluded_sensitive` metadata; their content is never read or returned.
- Commands are immutable templates derived from known project evidence and safe script names. The API accepts only registry IDs, never argv or shell text.
- The runner always uses argument arrays with `shell=False`, a fixed working directory, timeout, process termination, and capped output.
- Selecting and scanning never executes a command. Each run requires a separate explicit dashboard action.
- Analysis receives no process runner or write API. It reads only security-approved, scored line windows and cannot trigger commands or mutations.
- Repository text is delimited as untrusted data; model references are validated against supplied context before persistence.
- AI patch output cannot write files. Only `PatchEngine` receives approved validated diffs, and every target is rechecked against its original SHA-256 immediately before replacement.
- Rollback refuses to overwrite files changed after PocketPilot's patch.
- LAN API and WebSocket clients require an unexpired, non-revoked bearer token; loopback remains trusted for the desktop dashboard.
- Pairing codes are random, memory-only, expiring, single-use, and guess-limited. Device tokens are returned once and stored only as hashes server-side.
- Camera/gallery OCR runs on the phone. Image URIs and bytes never enter the agent API; only user-confirmed text and `CAMERA`/`GALLERY` provenance do.
- Camera and processed cache files are deleted after use. Gallery originals are external inputs and are never deleted.
- Voice audio is handled by the phone’s selected speech service and is not stored by PocketPilot. Only transcripts enter the closed intent resolver; voice has no shell, filesystem, or direct PatchEngine access.

See [the mobile guide](docs/mobile-app.md), [vision debugger guide](docs/vision-debugger.md), [voice engine guide](docs/voice-engine.md), [local AI guide](docs/local-ai.md), [patch-engine guide](docs/patch-engine.md), and [security model](docs/security-model.md).

## License

Competition prototype; licensing will be selected before external distribution.
