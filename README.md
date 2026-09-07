# PocketPilot AI

**See it. Say it. Fix it.**

PocketPilot AI is a phone-first, local software-engineering assistant for the iQOO Hackathon 2026 Developer Tools track. A developer captures or pastes an error on their phone, reviews a proposed code diff, explicitly approves it, and watches a constrained laptop agent apply the change and run real tests.

> Current phase: Milestone 9 presentation and reliability hardening is implemented over the verified Milestone 8 workflow. Presentation Mode, safe Prepare Demo, provider-transparent judge views, reconnect recovery, and repeatability tooling are available. Java remains `TOOL_MISSING` because Maven is not installed; Ollama is not configured; iQOO Office Kit is not implemented.

## Foundation architecture

| Component | Technology | Current responsibility |
| --- | --- | --- |
| Phone client | Expo development build, React Native, TypeScript, ML Kit, Android SpeechRecognizer/TTS | Camera/gallery OCR, safe push-to-talk commands, authenticated debug, approval, verification, history, and rollback UI |
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
2. Run `npm run demo:start` to start FastAPI and the desktop dashboard.
3. Run `npm run demo:reset` to restore and verify every registered scenario.
4. Open `http://127.0.0.1:4173`, select **Python User Service**, and pair the phone.
5. Run the real failing pytest command, scan it, generate a fix, review, approve, and show the real passing validation.

Run `npm run demo:check` again after startup for the final green readiness view. Preflight never installs tools, pulls models, changes the firewall, or deletes files. See the [master script](docs/demo-script.md) and [recovery playbook](docs/demo-recovery.md).

Use `npm run demo:stop` to stop only the two processes recorded by `demo:start`. In the desktop Presentation Mode dashboard, choose **Python User Service → Prepare Demo**. This restores and verifies the registered broken state, selects the workspace, and refreshes the honest readiness result. The mobile app starts in Presentation Mode; see the [presentation guide](docs/presentation-mode.md) and [event checklist](docs/hackathon-checklist.md).

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

Camera OCR uses native code and therefore requires an Android development build, not Expo Go. Without a local Android SDK, authenticate with Expo and create the internal development APK from `apps/mobile`:

```powershell
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client --lan
```

The physical phone installs the APK from the EAS build page and connects to the Metro server on the same private Wi-Fi. A local Android SDK/ADB workflow remains available through `npm run android` followed by `npm run android:metro`. See [the vision debugger guide](docs/vision-debugger.md).

Voice recognition and TTS also use native modules and require rebuilding the development APK after dependency/configuration changes. PocketPilot uses push-to-talk, shows the recognized transcript, deterministically resolves a closed intent, checks current session state, and asks for a second confirmation before approval or rollback. See [the voice engine guide](docs/voice-engine.md).

## Physical Android verification

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
