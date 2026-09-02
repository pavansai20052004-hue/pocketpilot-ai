# PocketPilot AI

**See it. Say it. Fix it.**

PocketPilot AI is a phone-first, local software-engineering assistant for the iQOO Hackathon 2026 Developer Tools track. A developer captures or pastes an error on their phone, reviews a proposed code diff, explicitly approves it, and watches a constrained laptop agent apply the change and run real tests.

> Current phase: project foundation only. Debug analysis, patching, command execution, OCR, voice, WebSocket transport, and iQOO Office Kit integration are not implemented yet.

## Foundation architecture

| Component | Technology | Phase A responsibility |
| --- | --- | --- |
| Phone client | Expo, React Native, TypeScript | Phone-first shell and typed status presentation |
| Desktop dashboard | Vite, React, TypeScript | Laptop-agent visibility shell |
| Local agent | FastAPI, Pydantic, Python | Typed health and system-status API |
| Shared contracts | TypeScript package | Cross-client states and event/status types |

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

## Verify

```powershell
npm run check
.\.venv\Scripts\python -m ruff check services/agent
.\.venv\Scripts\python -m pytest services/agent
```

The mobile web export is only a CI-friendly Phase A build check; Android remains the target product surface.

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

## Safety status

- The current agent exposes read-only process metadata only.
- No repository selector, command runner, model provider, patch application, or device bridge exists in Phase A.
- Future mutations require a proposed diff, explicit approval, a constrained workspace, and rollback support.
- Future build/test execution will use project-type-derived allowlists; model output will never be executed as shell input.

## License

Competition prototype; licensing will be selected before external distribution.
