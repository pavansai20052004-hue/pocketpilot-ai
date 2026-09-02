# PocketPilot AI

**See it. Say it. Fix it.**

PocketPilot AI is a phone-first, local software-engineering assistant for the iQOO Hackathon 2026 Developer Tools track. A developer captures or pastes an error on their phone, reviews a proposed code diff, explicitly approves it, and watches a constrained laptop agent apply the change and run real tests.

> Current phase: Milestone 2 session control plane. Secure repository actions, persistent debug sessions, validated workflow transitions, and reconnect-safe WebSocket events are implemented. AI debugging, patching, OCR, voice, and iQOO Office Kit are not implemented yet.

## Foundation architecture

| Component | Technology | Current responsibility |
| --- | --- | --- |
| Phone client | Expo, React Native, TypeScript | Phone-first shell and typed status presentation |
| Desktop dashboard | Vite, React, TypeScript | Workspace inspection and explicit safe-action UI |
| Local agent | FastAPI, Pydantic, Python | Bounded scanner, detection, allowlist, process runner, typed API |
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

## Start the three components

Use separate terminals from the repository root:

```powershell
npm run dev:mobile
```

```powershell
npm run dev:desktop
```

```powershell
.\.venv\Scripts\python -m uvicorn pocketpilot_agent.main:app --app-dir services/agent/src --reload --host 127.0.0.1 --port 8000
```

Open the dashboard URL printed by Vite. Expo prints the Android QR code and local development URLs. The FastAPI health endpoint is `http://127.0.0.1:8000/health`.

In the dashboard, enter one explicit repository root and choose **Inspect Project**. PocketPilot displays metadata and only the test/build/typecheck/lint actions supported by known manifests and available executables. A command runs only after its button is clicked.

## Desktop-agent API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/workspaces/inspect` | Select and inspect one explicit local root |
| `GET` | `/api/v1/workspaces/current` | Return current workspace metadata |
| `GET` | `/api/v1/workspaces/current/files` | Return the metadata-only file index |
| `GET` | `/api/v1/workspaces/current/commands` | Return applicable allowlisted actions |
| `POST` | `/api/v1/commands/{command_id}/run` | Explicitly execute one detected action |
| `GET` | `/api/v1/commands/runs/{run_id}` | Retrieve a completed structured result |

Session routes:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/sessions` | Create an `IDLE` session and its first event |
| `GET` | `/api/v1/sessions` | List recent local sessions |
| `GET` | `/api/v1/sessions/{id}` | Recover current state and revision |
| `POST` | `/api/v1/sessions/{id}/transitions` | Request one revision-checked legal transition |
| `GET` | `/api/v1/sessions/{id}/events` | Recover sequenced events after a cursor |
| WebSocket | `/api/v1/sessions/{id}/events/ws` | Receive a snapshot, missed events, then live events |

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

See [the full security model](docs/security-model.md) for trust boundaries, limits, Windows behavior, and residual risks.

## License

Competition prototype; licensing will be selected before external distribution.
