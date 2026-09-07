# PocketPilot AI delivery plan

This is the execution checklist for the hackathon prototype. A milestone is complete only when its acceptance criteria are verified and the relevant documentation is current.

## Current status

- **Complete:** Phase A / Milestone 0 — architecture and scaffolding
- **Complete:** Milestone 1 — desktop agent, repository scanner, and safe test runner
- **Complete:** Milestone 2 — debug session API and controlled state machine
- **Complete:** Milestone 3 — local analysis provider
- **Complete:** Milestone 4 — patch lifecycle
- **Complete:** Milestone 5 — authenticated mobile bridge and complete text-debug workflow
- **Complete:** Milestone 6 — Camera Vision Debugger / OCR, verified on Android
- **Complete:** Milestone 7 — constrained voice actions, verified on Android
- **Complete:** Milestone 8 — deterministic multi-language hackathon demos, with Java runtime verification conditional on Maven

## Dependency path

`M0 foundation → M1 safe local primitives → M2 session API → M3 analysis → M4 patch lifecycle → M5 authenticated phone workflow → M6 camera OCR → M7 voice → M8/M9 demo polish → M11 verified device integration → M12 final QA`

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

- [x] Structured Mock/Ollama patch providers and centralized patch prompt.
- [x] Strict unified-diff parser with in-memory dry run.
- [x] Workspace, sensitive-file, supplied-context, hash, size, and risk validation.
- [x] Revision- and patch-ID-bound approval/rejection gate.
- [x] Atomic multi-file application and private rollback snapshots.
- [x] Patched-hash rollback conflict protection.
- [x] Deterministic allowlisted validation-command selection and real execution.
- [x] Durable proposal, approval, application, test, and rollback state.
- [x] Reconnect snapshot/event coverage and desktop diff/approval/rollback UI.
- [x] Temporary-copy Python repair fixture and mandatory real end-to-end test.

Acceptance criteria: no write occurs before explicit approval; out-of-root paths and malformed diffs are rejected; rollback restores exact prior content.

Verification evidence (2026-09-02):

- `python -m ruff check services/agent`: passed.
- `python -m pytest services/agent -ra`: 85 passed, 4 skipped (two explicitly disabled Ollama integration tests and two permission-dependent Windows symlink tests).
- `npm run check`: ESLint and strict type checks passed; 8 Vitest tests passed; desktop production build and Expo web export passed.
- Real temporary-copy smoke: safe pytest failed with exit 1 before repair; the MEDIUM-risk one-file proposal left source unchanged before approval; approved patch passed the same `python.exe -m pytest -q`; session reached `SUCCESS`; persisted status recovered as `VERIFIED`; rollback restored exact original bytes and the test failed again.
- Measured smoke timings: initial failing test 736 ms; generation 0 ms; patch validation 1 ms; atomic apply 3 ms; post-apply verification 566 ms; rollback 3 ms.
- Ollama patch smoke skipped because `127.0.0.1:11434` refused the connection; no model was installed or pulled.

### M5 — Mobile bridge and core UI (P0)

Depends on: M2, M3, M4.

- [x] Random, expiring, single-use, guess-limited pairing codes and hashed device-token registry.
- [x] Loopback-only pairing administration, device list, last-seen status, and revocation dashboard.
- [x] Authenticated LAN HTTP boundary and WebSocket connection setup.
- [x] Expo SecureStore token/address/device persistence on Android with no plain AsyncStorage fallback.
- [x] `DeviceBridge`, production `LocalWebSocketBridge`, dev `MockDeviceBridge`, and unimplemented Office Kit stub.
- [x] Central typed mobile API client, useful network errors, timeout, and bounded safe retries.
- [x] Phone Home, Debug, Sessions, Settings, root-cause, diff review, approval, applying, success, failure, and rollback UI.
- [x] Sequenced snapshot reconciliation, duplicate suppression, bounded reconnect, and AppState foreground recovery.
- [x] Demo Mode that prefills only input while retaining real backend execution.
- [x] Backend auth, TypeScript client/socket/reducer, and authenticated end-to-end device-like smoke coverage.

Acceptance criteria: the Android-first client controls the complete authenticated text-debug workflow while workspace selection and all repository data remain on the laptop.

Verification evidence (2026-09-03):

- `python -m ruff check services/agent`: passed. `python -m pytest services/agent -ra`: 92 passed, 4 skipped (two opt-in Ollama checks and two Windows symlink-permission checks).
- ESLint and strict TypeScript passed. Vitest: desktop 2, mobile 12, shared contracts 6; 20 total passed with no skips. Desktop production build and Expo web export passed.
- Backend/device-focused checks passed: pairing success/expiry/wrong-code/attempt-limit/reuse, token success/expiry/revocation, protected HTTP, unauthorized/authorized WebSocket, and full device-like workflow.
- Device-like temporary-copy smoke: phone client paired, authenticated its socket, analyzed the real traceback, received root cause, reviewed a non-empty real diff, approved it, passed real pytest, rolled back exact bytes, and reconnected to a coherent `ROLLED_BACK` snapshot.
- Local smoke timings: code generation 21 ms, pairing 7 ms, session start 18 ms, authenticated WebSocket connect 8 ms, mock analysis 64 ms, event reconciliation 17 ms, patch generation 51 ms, apply plus real pytest verification 534 ms, rollback 26 ms, reconnect snapshot 9 ms.
- Physical Android test: skipped because ADB and a connected device were unavailable; no device result is inferred from the Expo web export.

### M6 — Camera Vision Debugger / OCR (P1)

Depends on: M5.

- [x] Android camera UI with permission recovery, flash, framing guide, capture, preview, rotate, retake, and centered crop.
- [x] Gallery/screenshot input with explicit ownership that prevents deletion of originals.
- [x] Expo native development build with offline-bundled Latin ML Kit OCR and typed provider errors.
- [x] Separate raw/normalized OCR contracts, conservative technical normalizer, error postprocessor, and deterministic quality heuristics.
- [x] Mandatory editable review with poor-quality, secret, and prompt-injection warnings before analysis.
- [x] `CAMERA`/`GALLERY` provenance through the authenticated analysis API and durable result.
- [x] Best-effort deletion of temporary camera/preprocessed files after use, close, retake, or successful handoff.
- [x] Deterministic project-owned Python/Java/TypeScript image fixtures including low contrast and rotation.
- [x] Mock capture/OCR providers and tests for state, preprocessing, cleanup, normalization, quality, privacy, and API handoff.
- [x] Physical Android camera/OCR and camera-to-fix run using an EAS internal development APK on a real phone over private LAN.

Acceptance criteria: terminal screenshot fixture produces editable `ErrorContext`; low confidence never advances without review.

Verification evidence (2026-09-03):

- `npm run check`: ESLint and strict TypeScript passed; Vitest passed 37 tests (desktop 2, mobile 29, shared contracts 6); desktop production build and Expo web export passed.
- Agent Ruff passed; pytest passed 94 tests with 4 documented environment/opt-in skips.
- Expo dependency check passed, config plugins resolved, and Expo Doctor passed 21/21 checks.
- Authenticated `CAMERA`-source smoke passed pairing → analysis → patch → approval → real pytest → rollback → reconnect against a temporary project (analysis 69 ms, apply/test 529 ms).
- Browser QA paired to the local agent and verified the responsive Scan Error entry/privacy UI.
- Native image accuracy and the physical golden path were subsequently verified on Android hardware on 2026-09-04.

Verification evidence (2026-09-04):

- EAS internal development build `1a716796-9260-44bd-a463-80faed4dcceb` installed and launched on a physical Android handset without a native-module crash; device model and Android version were not recorded.
- Private-LAN pairing at `192.168.0.202:8000`, secure token reuse, authenticated WebSocket connection, app restart, event replay, and coherent `ROLLED_BACK` recovery passed.
- Camera permission, live preview, flash on/off, capture, portrait and landscape handling, retake, guided crop, full-image preprocessing, and native bundled Latin ML Kit OCR passed. The camera controls were moved left to avoid a phone system/development overlay discovered during the test.
- Real pytest terminal OCR completed in 375 ms and recovered 7/7 selected critical tokens: `TypeError`, `NoneType`, `user_service.py`, `5`, `test_missing_user_uses_fallback`, `get_user_name`, and `Unknown`. Full-image OCR also included surrounding Windows UI text and corrupted some non-critical assertion punctuation, confirming that editable review remains necessary.
- The first guided laptop-screen capture completed in 1176 ms, showed editable output, and required manual corrections before submission. The confirmed text produced the correct root cause and one-file patch.
- Network inspection before confirmation showed no analysis request. The persisted event recorded camera-text provenance, and the authenticated request contained confirmed text/source only—no image bytes, Base64, multipart data, or camera URI.
- Camera → OCR → edit → analyze → root cause → generate → review → approve → apply → real pytest (`2 passed` in 530 ms) → `FIX VERIFIED` → undo completed. Rollback restored the exact original file and the expected test failure (`1 failed, 1 passed`).
- A blank capture completed in 830 ms, returned `POOR · 0/100`, showed no-readable-text guidance, kept the text empty, disabled Analyze, and allowed discard/retake without a crash.
- Final regression passed: `npm run check` completed lint, strict type checks, 37 tests, the desktop production build, and the mobile web export; Ruff passed; pytest passed 94 tests with 4 documented environment/opt-in skips; Expo dependency validation passed; Expo Doctor passed 21/21 checks; the Android manifest, OCR autolinking, and EAS development APK profile resolved correctly.

### M7 — Voice actions (P1)

Depends on: M5.

- [x] Android push-to-talk recognition adapter plus deterministic mock, explicit permission recovery, capability metadata, and honest offline status.
- [x] Closed deterministic `VoiceIntent` resolver with contextual aliases, dangerous-command rejection, and no unrestricted AI fallback.
- [x] State-aware validator and application-only executor that reuse existing button actions and preserve backend revision/hash/rollback protection.
- [x] Two-step approval and rollback confirmation with narrow voice confirmation, manual controls, revalidation, and timeout.
- [x] Android TTS plus deterministic mock, bounded structured response formatting, stop-before-listen audio sequencing, and concise explanations.
- [x] Home Speak Command, contextual Debug microphone, transcript/intent/status UI, accessibility labels, local command history, capability Settings, and real latency capture.
- [x] Separate `VOICE` action provenance without confusing camera/text error provenance; no stored audio or new audio-upload endpoint.
- [x] Automated intent, dangerous phrase, state, confirmation boundary, executor isolation, provider, response, API provenance, and regression coverage.
- [x] Physical recognition and command matching for analysis, generation, explanation, and showing the patch; audible TTS, Stop Speaking, and subsequent listening confirmed by the user.
- [x] Rendered voice-sheet regression reproduces and fixes lost confirmation after no speech; retry retains its original target and deadline, with a visible countdown.
- [x] Invalidate cancelled/backgrounded listening callbacks, prevent overlapping microphone starts, recover from transcript-free completion, and supply state-specific fixed command hints; covered by rendered and adapter tests.
- [x] Reset the event cursor when switching debug sessions so earlier pipeline events are not discarded; reject late events from the old socket.
- [x] Physical voice approval and rollback, dangerous-command rejection, background/foreground recovery, natural-accent behavior, and signature-demo verification; venue-level noise remains a documented limitation.

Acceptance criteria: supported phrases map to typed actions; arbitrary speech cannot become a shell command. Passed on a physical Android phone on 2026-09-07.

### M8 — Hackathon demo repository suite (P0)

Depends on: M6.

- [x] Deterministic Python, Java/Spring-style, and React/TypeScript broken examples with real tests and metadata.
- [x] Mock analysis and genuine one-file patches for all three languages.
- [x] Registered-ID-only selection, bounded reset, real failure health checks, and traversal/security coverage.
- [x] Desktop demo dashboard, mobile Demo Mode selector, preflight, reset/check/start helpers, and recovery documentation.
- [x] Python three-cycle and React two-cycle repair/pass/rollback/fail stability tests.
- [ ] Java live cycles on this laptop: Maven is not installed; suite remains conditional and reports `TOOL_MISSING`.
- [x] One short physical Android regression across a Milestone 8 demo.

Acceptance criteria: reset scripts are repeatable and the golden path passes without fabricated results. Passed with the documented Java tool gap allowed by the milestone.

Verification evidence (2026-09-07):

- Registered mobile selection displayed **DEMO WORKSPACE — Python User Service** while paired and connected.
- The physical camera read the real pytest terminal failure in 2,060 ms with `GOOD · 100/100`; all four required tokens were recovered: `TypeError`, `NoneType`, `user_service.py`, and `get_user_name`.
- Compact camera OCR output `user_service.py:5: TypeError` initially exposed a parser gap. The parser and no-patch recovery UI were corrected, automated coverage was added, and the same captured text retried successfully at HIGH confidence with bounded `user_service.py:5` context.
- Physical voice **Fix this** generated the genuine one-file `None` guard and **Show patch** displayed the review. The full approve, real pytest pass, rollback, and restored-failure path passed repeatedly in isolated automated cycles.
- Python passed 3/3 full cycles; React passed 2/2. Java mock analysis and patch generation passed, while live Maven validation remained `TOOL_MISSING` and was not fabricated.
- Final regression: Ruff passed; backend pytest passed 116 with 5 documented skips; Vitest passed desktop 2, mobile 136, and shared 6 tests; ESLint, strict TypeScript, desktop production build, mobile web export, Expo Doctor 21/21, and Android config introspection all passed.

### M9 — UI polish and reliability (P0/P1)

Depends on: M8.

- [x] Dedicated desktop/mobile Presentation Mode over the real workflow.
- [x] Judge-readable mobile home, OCR review, root cause, diff, approval, progress, and success states.
- [x] Truthful Ollama vs Deterministic Demo Provider labeling and network/privacy indicators.
- [x] Registered-ID-only Prepare Demo operation and distinct New Session vs Reset Demo actions.
- [x] Desktop above-the-fold readiness, live architecture path, expandable technical details, and reduced clutter.
- [x] Plain-language timeout/provider/stale-patch recovery plus persisted-session resume.
- [x] Safe startup and PocketPilot-owned shutdown helpers.
- [x] Five-cycle Python / three-cycle React benchmark tooling.
- [x] Three-minute, 60-second, 30-second pitch, judge Q&A, recovery guide, and event checklist.
- [x] Final full automated regression, physical Android hero run, and timed physical rehearsal.

Acceptance criteria: full demo completes repeatedly within three minutes after a clean reset and remains legible on the target Android device. Passed on the physical iQOO phone on 2026-09-08.

Verification evidence (2026-09-08):

- Desktop Presentation Mode was visually checked at 1366×768. One-click Python preparation returned `READY_WITH_TOOL_GAPS`, truthfully labeled the Deterministic Demo Provider, and exposed Maven as `TOOL_MISSING`.
- The physical iQOO phone rendered the new Presentation Home, re-paired over the authenticated LAN bridge, captured the real pytest terminal failure, and produced a HIGH-confidence bounded root cause at `user_service.py:5`.
- The phone generated and displayed the genuine one-file, two-line `None` guard, required explicit approval, ran real pytest, and showed `FIX VERIFIED`, `2/2` tests passed, one file changed, provider `DEMO`, diff/explanation controls, and Undo.
- Physical rollback displayed `FIX UNDONE` and restored the exact broken file. A second uninterrupted physical rehearsal completed from GO to `FIX VERIFIED` in 42.3 seconds; the backend independently recorded the new SUCCESS session.
- The timed session spent 71 ms in confirmed-text analysis, 31 ms generating/validating the patch, and 829 ms applying the approved patch plus real tests. The entire backend session after confirmed OCR completed in 12.0 seconds.
- Reliability benchmark passed Python 5/5 and React 3/3 repair/pass/rollback cycles. Java remained an honest conditional skip because Maven is not installed.
- Safe shutdown/restart was exercised against owned process records; an agent matcher defect was found during the rehearsal, corrected, and the subsequent two-process stop/start round trip passed.
- Final regression passed Ruff; backend pytest passed 118 with 5 documented skips; Vitest passed desktop 3, mobile 137, and shared 6 tests; ESLint, strict TypeScript, desktop production build, mobile web export, Expo Doctor 21/21, and Android config introspection passed.

### M10 — Verified iQOO integration (P2)

Depends on: official documentation or SDK access.

- Implement `OfficeKitBridge` only against verified official interfaces.

Acceptance criteria: source documentation is recorded, capability is tested on hardware, and WebSocket remains the working fallback. Until then this milestone is explicitly unimplemented.

### M11 — Final QA and presentation (P0)

Depends on: M9, M10; M11 is optional.

- Regression suite, device rehearsal, failure drills, setup validation, submission copy, and demo script.

Acceptance criteria: clean-machine setup is documented; P0 suite passes; rollback and offline fallback are rehearsed; judging claims match working software.

## Cross-cutting acceptance rules

- TypeScript remains strict and Python remains typed.
- No arbitrary shell commands, unapproved file writes, secrets, fake APIs, or invented vendor integrations.
- P0 regressions block later feature work.
- Each completed milestone includes test evidence, documentation updates, and an explicit limitations list.
