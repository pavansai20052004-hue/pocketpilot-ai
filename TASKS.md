# PocketPilot AI delivery plan

This is the execution checklist for the hackathon prototype. A milestone is complete only when its acceptance criteria are verified and the relevant documentation is current.

## Current status

- **Complete:** Phase A / Milestone 0 — architecture and scaffolding
- **Complete:** Milestone 1 — desktop agent, repository scanner, and safe test runner
- **Complete:** Milestone 2 — debug session API and controlled state machine
- **Complete, awaiting approval:** Milestone 3 — local analysis provider
- **Next after approval:** Milestone 4 — patch lifecycle

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

- [x] Repository workspace selection constrained to an approved root.
- [x] Metadata-only file index with sensitive/generated exclusions and scan limits.
- [x] Project/language/framework/build-system detection and evidence.
- [x] Allowlisted test/build/typecheck/lint command resolution.
- [x] Explicit command execution with no model or shell command input.
- [x] Timeout, output cap, stdout/stderr/exit code/duration capture.
- [x] Versioned workspace/command API and desktop dashboard.
- [x] Windows path, malicious input, scanner, registry, runner, and API tests.
- [x] Final full-suite verification and real-repository smoke test.
- [x] Review the final diff and create the milestone commit.

Acceptance criteria: supported fixture projects are detected correctly; ignored trees are absent; secret contents are never returned; only exact approved command shapes execute; timeouts and bounded captured output are tested; the existing mobile build remains green.

Verification evidence (2026-09-02):

- `npm run check`: ESLint and all strict type checks passed; 7 Vitest tests passed; Vite production build and Expo web export passed.
- `python -m ruff check services/agent`: passed.
- `python -m pytest services/agent`: 31 passed, 2 symlink-creation tests skipped because the Windows host does not grant link creation; production reparse checks remain active.
- PocketPilot repository smoke: 63 files indexed, no truncation, React/Vite + Expo + FastAPI detected, 12 commands registered.
- Performance: scanner metadata walk 14 ms; complete inspect API request 223 ms.
- Safe execution: `npm run test` in `packages/shared-types` passed 5 tests with exit code 0 in 3,270 ms; output was not truncated.

### M2 — Debug session API and state machine (P0)

Depends on: M1.

- [x] Typed Python and TypeScript session/event contracts.
- [x] SQLite-backed local sessions and append-only sequenced event history.
- [x] Central transition table with optimistic revisions and two-retry limit.
- [x] Versioned session creation, lookup, listing, transition, and event APIs.
- [x] Reconnect-safe WebSocket snapshot, missed-event recovery, and live fan-out.
- [x] State-machine, persistence, HTTP, validation, and WebSocket tests.
- [x] Final full-suite verification and persistence/WebSocket smoke test.
- [x] Final diff review and separate milestone commit.

Acceptance criteria: invalid transitions fail safely; reconnecting clients can recover current state; every transition emits a structured event.

Verification evidence (2026-09-02):

- `npm run check`: ESLint and strict type checks passed; 8 Vitest tests passed; Vite production build and Expo web export passed.
- `python -m ruff check services/agent`: passed.
- `python -m pytest services/agent`: 49 passed, 2 permission-dependent symlink tests skipped.
- Live API/WebSocket smoke: created `IDLE` revision 0, received snapshot sequence 1, transitioned to `CAPTURED` revision 1, and received live `error_captured` sequence 2.
- Persistence smoke: after a FastAPI restart, SQLite restored the same session, revision, state, and both ordered events.

### M3 — Local analysis provider (P0)

Depends on: M1, M2.

- [x] `LLMProvider` contract with Ollama and deterministic mock implementations.
- [x] Deterministic Java/Python/JavaScript/TypeScript/plain-text parsing.
- [x] Scored, bounded, security-filtered repository context windows.
- [x] Central injection-resistant prompts and one bounded JSON repair attempt.
- [x] Validated/persisted root-cause output with reference sanitization and timings.
- [x] Session transitions, structured progress events, and WebSocket delivery.
- [x] Provider health, typed failures, duplicate prevention, and timeout handling.
- [x] Desktop analysis workflow and shared mobile-compatible contracts.
- [x] Deterministic Java nullable-dereference fixture and local smoke path.
- [x] Documentation, security verification, full suite, and milestone commit.

Acceptance criteria: no full-repository upload; model selection is configurable; analysis has schema validation; unavailable Ollama does not break demo mode.

Verification evidence (2026-09-02):

- `python -m ruff check services/agent`: passed.
- `python -m pytest services/agent -ra`: 67 passed, 3 skipped (two permission-dependent symlink tests and the explicitly disabled Ollama integration test).
- `npm run check`: ESLint and all strict type checks passed; 8 Vitest tests passed; desktop production build and Expo web export passed.
- Ollama probe: skipped because the local endpoint at `127.0.0.1:11434` refused the connection; no model was installed or pulled.
- Deterministic Java smoke: Java detected; four bounded source/test windows selected; mock provider returned HIGH-confidence nullable-dereference analysis for `src/main/java/demo/UserService.java:12`; final state `ROOT_CAUSE_FOUND` with 15 persisted ordered events.
- Measured smoke timings: parse 1 ms, context 3 ms, provider 1 ms, validation 0 ms, total 60 ms.

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
