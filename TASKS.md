# PocketPilot AI delivery plan

This is the execution checklist for the hackathon prototype. A milestone is complete only when its acceptance criteria are verified and the relevant documentation is current.

## Current status

- **Complete, awaiting approval:** Phase A / Milestone 0 — architecture and scaffolding
- **Next:** Milestone 1 — desktop agent, repository scanner, and safe test runner
- **Scope gate:** do not implement debugging-agent behavior until Phase A is approved

## Dependency path

`M0 foundation → M1 safe local primitives → M2 session API → M3 analysis → M4 patch lifecycle → M5 mobile bridge → M6 end-to-end flow → M7/M8 inputs → M9 demo repos → M10 polish → M11 verified device integration → M12 final QA`

## Milestones

### M0 — Architecture and scaffolding (P0)

- [x] Record architecture and security boundaries.
- [x] Scaffold the Expo mobile client, FastAPI agent, Vite desktop dashboard, and shared TypeScript contracts.
- [x] Add environment examples and root developer commands.
- [x] Verify installs, lint, type checks, tests, production builds, and startup smoke tests.
- [x] Update this milestone with final verification evidence.

Acceptance criteria:

- Mobile project starts through Expo and produces a web export.
- FastAPI serves typed health and system-status endpoints.
- Desktop dashboard starts and produces a production build.
- Both TypeScript clients consume `@pocketpilot/shared-types` under strict mode.
- Root check and Python checks pass from a clean dependency install.

Verification evidence (2026-09-02):

- `npm run check`: ESLint passed; strict type checks passed for all three workspaces; 6 Vitest tests passed; Vite production build and Expo web export passed.
- `python -m ruff check services/agent`: passed.
- `python -m pytest services/agent`: 3 API tests passed.
- Startup smoke: FastAPI `/health`, typed system status, Vite, and Expo Metro web root each returned HTTP 200.
- `npm audit`: reports 10 moderate findings from Expo's transitive `xcode@3.0.1 → uuid@7.0.3` build-tool dependency. The available forced remediation downgrades Expo to SDK 46 and is rejected; track the Expo upstream dependency rather than destabilizing the target SDK.

### M1 — Safe desktop foundations (P0)

Depends on: M0.

- Repository workspace selection constrained to an approved root.
- Project/build-system detection and ignore rules.
- Allowlisted test/build command resolution with no model-provided shell execution.
- Repository scanner and command-runner tests.

Acceptance criteria: supported fixture projects are detected correctly; excluded and secret files are never returned; only exact approved command shapes can execute; cancellation, timeouts, and captured output are tested.

### M2 — Debug session API and state machine (P0)

Depends on: M1.

- Typed session/event schemas and persistent local event history.
- Controlled workflow transitions and WebSocket event stream.
- API and state-transition tests.

Acceptance criteria: invalid transitions fail safely; reconnecting clients can recover current state; every transition emits a structured event.

### M3 — Local analysis provider (P0)

Depends on: M1, M2.

- `LLMProvider` contract with Ollama and deterministic demo/mock implementations.
- Bounded context selection and structured error/root-cause output.
- Availability checks, timeouts, and graceful demo fallback.

Acceptance criteria: no full-repository upload; model selection is configurable; analysis has schema validation; unavailable Ollama does not break demo mode.

### M4 — Patch lifecycle (P0)

Depends on: M2, M3.

- Unified diff proposal, validation, approval gate, application, and rollback.
- Workspace boundary and file-type enforcement.
- Patch-engine and rollback tests.

Acceptance criteria: no write occurs before explicit approval; out-of-root paths and malformed diffs are rejected; rollback restores exact prior content.

### M5 — Mobile bridge and core UI (P0)

Depends on: M2.

- `DeviceBridge` abstraction and local WebSocket implementation.
- Connection, capture/paste, analysis, diff approval, progress, and result screens.
- Reconnect and stale-session behavior.

Acceptance criteria: Android client completes the typed local connection flow and visibly represents every workflow state.

### M6 — End-to-end text debugging (P0)

Depends on: M3, M4, M5.

- Text error → context → analysis → patch → approval → test → verified result.
- One automated integration scenario with real tests.

Acceptance criteria: deterministic broken fixture is repaired only after approval and its real test suite passes; failure and retry limits are observable.

### M7 — Camera OCR (P1)

Depends on: M5, M6.

- Camera capture, preprocessing, device OCR adapter, confidence, and editable extraction.

Acceptance criteria: terminal screenshot fixture produces editable `ErrorContext`; low confidence never advances without review.

### M8 — Voice actions (P1)

Depends on: M5, M6.

- Speech adapter and fixed intent mapping for supported actions.

Acceptance criteria: supported phrases map to typed actions; arbitrary speech cannot become a shell command.

### M9 — Hackathon demo repositories (P0)

Depends on: M6.

- Deterministic Java/Spring, Python, and React broken examples with real tests.
- At least one camera-led golden-path scenario.

Acceptance criteria: reset scripts are repeatable and the golden path passes offline without fabricated results.

### M10 — UI polish and reliability (P0/P1)

Depends on: M6, M9.

- Premium phone-first states, subtle timeline animation, history, offline/demo readiness, and one-command startup.

Acceptance criteria: full demo completes repeatedly within three minutes after a clean reset and remains legible on the target Android device.

### M11 — Verified iQOO integration (P2)

Depends on: official documentation or SDK access.

- Implement `OfficeKitBridge` only against verified official interfaces.

Acceptance criteria: source documentation is recorded, capability is tested on hardware, and WebSocket remains the working fallback. Until then this milestone is explicitly unimplemented.

### M12 — Final QA and presentation (P0)

Depends on: M9, M10; M11 is optional.

- Regression suite, device rehearsal, failure drills, setup validation, submission copy, and demo script.

Acceptance criteria: clean-machine setup is documented; P0 suite passes; rollback and offline fallback are rehearsed; judging claims match working software.

## Cross-cutting acceptance rules

- TypeScript remains strict and Python remains typed.
- No arbitrary shell commands, unapproved file writes, secrets, fake APIs, or invented vendor integrations.
- P0 regressions block later feature work.
- Each completed milestone includes test evidence, documentation updates, and an explicit limitations list.
