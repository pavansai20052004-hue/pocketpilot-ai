# PocketPilot AI pitch deck content

This is copy and visual direction for a 10-slide deck. Use real PocketPilot screenshots only; do not create simulated product evidence.

## Slide 1 — PocketPilot AI

**See it. Say it. Fix it.**

Phone-first, repository-aware, test-verified developer tools.

Visual: clean product logo/title beside a real physical iQOO screenshot showing Presentation Mode.

## Slide 2 — Debugging is fragmented

`error → search → AI → copy → IDE → edit → terminal → test`

Developers repeatedly move context among screens and tools. A screenshot explanation can identify a possibility, but the developer still has to locate the code, transfer the change, run tests, and decide whether it is safe.

Visual: one simple horizontal flow with the manual handoffs emphasized.

## Slide 3 — From physical error to verified fix

`camera / voice / text → PocketPilot → repository-aware analysis → safe verified fix`

The phone captures and controls the workflow. The laptop owns source access, the local model, patch validation, test execution, and rollback.

Visual: phone on the left, controlled laptop agent in the center, repository on the right.

## Slide 4 — Six controlled steps

1. **Scan** — capture a visible terminal, IDE, browser, projector, or test-machine error.
2. **Understand** — parse the failure and select bounded repository evidence.
3. **Generate** — ask a local coding model for structured analysis and a minimal diff.
4. **Review** — show the evidence and exact patch on the phone.
5. **Apply** — require explicit human approval and verify file hashes.
6. **Verify** — run only the registered test command and report its real output.

Visual: six numbered stages, no dense architecture detail.

## Slide 5 — Live demo: failure closed

**Before:** `1 failed, 1 passed`

**After:** `2 passed`

Required real screenshots:

- Laptop terminal showing the original Python failure.
- Phone OCR confirmation screen with the relevant traceback tokens.
- Phone root-cause screen showing `user_service.py · line 5`.
- Phone patch review showing the two-line guard.
- Phone `FIX VERIFIED` screen showing `2 / 2 tests passed`.

Do not crop away the provider label when discussing local AI. Do not use a deterministic-provider screenshot as evidence of Ollama.

## Slide 6 — Local-first architecture

**Phone**

- Camera and on-device OCR
- Closed voice intents
- Review and approval UI

↓ authenticated local HTTP/WebSocket bridge

**Laptop**

- FastAPI session engine
- Bounded repository context
- Ollama local coding model
- Schema and patch validators
- Allowlisted test runner
- SQLite event and rollback state

Visual: adapt `docs/diagrams/system-architecture.md`.

## Slide 7 — AI output is untrusted

`AI proposal → schema validation → evidence/path/hash checks → human approval → atomic patch → allowlisted tests`

The model has no filesystem or shell interface. It cannot select arbitrary commands, bypass approval, or claim that tests passed. Later file changes block unsafe rollback.

Visual: adapt `docs/diagrams/security-boundary.md` with the human approval gate highlighted.

## Slide 8 — More than an explanation

**General assistant outcome:** useful analysis or suggested code.

**PocketPilot outcome:** repository evidence, validated diff, human decision, actual tests, verified result, and rollback.

PocketPilot does not claim screenshot understanding itself is novel and does not attack general or IDE assistants. It explores a phone-first control surface that begins from a physical error outside one specific editor.

## Slide 9 — Measured prototype results

- Physical iQOO camera/OCR/voice/approval/test flow: **PASS**.
- Physical run to `FIX VERIFIED`: **42.3 seconds** using the labeled deterministic provider on 2026-09-08.
- Python deterministic reliability: **5/5 complete cycles**.
- React deterministic backup: **3/3 complete cycles**.
- Final automated regression: **130 backend tests passed, 4 skipped; 147 Vitest tests passed; Expo Doctor 21/21**.
- Real Ollama (`qwen3-coder:30b`) reliability: **5/5 complete repair, real-test, rollback, and restored-failure cycles** with no manual output edits.
- Real Ollama median latency: **46.4 seconds analysis, 67.2 seconds patch generation, 117.8 seconds complete measured workflow**.

These are development-machine observations, not universal performance guarantees.

## Slide 10 — The phone becomes the safe interface

PocketPilot turns the phone into a safe interface to the development environment—useful when the failure is visible wherever the IDE is not.

**See it.**

**Say it.**

**Fix it.**

Footer truth note: PocketPilot uses its own authenticated LAN bridge. Its adapter architecture can adopt a verified iQOO cross-device API if developer access becomes available; it does not currently claim Office Kit integration.
