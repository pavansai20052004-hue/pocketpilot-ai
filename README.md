# PocketPilot AI

**See it. Say it. Fix it.**

PocketPilot AI is a phone-first, local software-engineering assistant for the iQOO Hackathon 2026 Developer Tools track. A developer captures or pastes an error on their phone, reviews a proposed code diff, explicitly approves it, and watches a constrained laptop agent apply the change and run real tests.

> Current phase: Milestone 6 Camera Vision Debugger is implemented and awaiting physical Android validation. The Android development build captures or imports an error image, preprocesses it, runs offline on-device OCR, requires editable confirmation, and sends only confirmed text to the paired laptop. Voice and iQOO Office Kit are not implemented.

## Foundation architecture

| Component | Technology | Current responsibility |
| --- | --- | --- |
| Phone client | Expo development build, React Native, TypeScript, ML Kit | Camera/gallery OCR, authenticated debug, approval, verification, history, and rollback UI |
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
4. On the phone choose **Scan Error** for camera/gallery OCR or **Paste Error** for text, confirm the input, then analyze, generate, review, approve, verify, or undo the real fix.

The phone cannot browse or select laptop paths. Pairing codes expire after five minutes, allow five guesses, and are single-use. Android stores the opaque device token in Expo SecureStore; the laptop persists only its SHA-256 hash.

Camera OCR uses native code and therefore requires an Android development build, not Expo Go. From `apps/mobile`, run `npm run android` with Android SDK/ADB and a device configured, then use `npm run android:metro` for later Metro sessions. See [the vision debugger guide](docs/vision-debugger.md).

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
demo/              Reserved for deterministic demo repositories
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

See [the mobile guide](docs/mobile-app.md), [vision debugger guide](docs/vision-debugger.md), [local AI guide](docs/local-ai.md), [patch-engine guide](docs/patch-engine.md), and [security model](docs/security-model.md).

## License

Competition prototype; licensing will be selected before external distribution.
