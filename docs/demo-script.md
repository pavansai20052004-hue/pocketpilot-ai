# PocketPilot presentation script

Start the release laptop with `npm run pocketpilot:start`, install/open the standalone presentation APK, and keep Metro stopped. Use the fresh address and pairing code printed by the launcher. The public showcase is presentation-only and is not the control application.

## 30-second pitch

Developers lose focus moving between a visible error, search, AI, source code, and tests. PocketPilot turns the phone into a repository-aware debugging assistant: scan an error, ask for a fix by voice, review a controlled patch, approve it, and see real tests pass. Camera capture, closed voice actions, local-provider support, human approval, and conflict-safe rollback make the workflow useful without handing an AI unrestricted access.

## Three-minute hero demo

Primary: Python User Service. Backup 1: React User Profile. Java is backup 2 only when preflight reports `READY`.

- **0:00–0:20 — problem.** Deliver the pitch above in one sentence and show the real terminal failure.
- **0:20–0:45 — see it.** Tap **Scan Error**, capture the terminal, point out `TypeError`, `user_service.py`, and line 5, then confirm the editable OCR text.
- **0:45–1:10 — understand it.** Tap **Analyze**. Show actual pipeline events, the bounded file/line, and the concise evidence.
- **1:10–1:35 — say it.** Say “Fix this.” Show the real one-file diff and why it is expected to work.
- **1:35–2:00 — approve safely.** Say “Approve fix,” then “Yes,” or use the same visible confirmation button in a noisy room. Explain that voice cannot run arbitrary shell commands.
- **2:00–2:25 — prove it.** Show the actual registered command, real `2 passed` output, and **FIX VERIFIED**.
- **2:25–2:45 — explain.** Say “What changed?” and let the phone speak the bounded explanation.
- **2:45–3:00 — close.** “See it. Say it. Fix it. PocketPilot AI.”

Do not include rollback unless time remains. During Q&A, use **Undo Fix**, rerun the registered test, and show the original failure returns.

Record the physical rehearsal time in the final readiness report. Keep it separate from automated deterministic and real-model benchmark time.

## 60-second version

1. Show the real `NoneType` failure.
2. Scan it and confirm the OCR text.
3. Tap **Analyze** and point to `user_service.py · line 5`.
4. Say “Fix this,” then show the added `None` guard.
5. Tap **Approve Fix → Confirm**.
6. Show the real `2 passed` result and **FIX VERIFIED**.

Skip spoken explanations, architecture, and rollback. If camera or speech is slow, use **Paste Error** and visible buttons; those paths call the same backend.

## Presenter rules

- Use **Prepare Demo** before the judge arrives.
- Never call the deterministic provider Ollama or a real local model.
- Do not retry speech repeatedly in venue noise; use the matching button and explain the closed-intent equivalence.
- Do not hide a failure. Use the recovery path and switch visibly to React when necessary.

## Verified rehearsal result

On 2026-09-08 the physical iQOO presentation run completed from **GO** to **FIX VERIFIED** in 42.3 seconds. The backend recorded a distinct successful session with 71 ms confirmed-text analysis, 31 ms patch generation/validation, and 829 ms approved apply plus real pytest. This is environment-specific evidence, not a promise of identical venue timing.

On 2026-09-09 the standalone presentation APK completed the real-model camera hero with Metro stopped. `qwen3-coder:30b` analysis took 65.140 seconds, patch generation 118.284 seconds, apply 2 milliseconds, and real pytest 675 milliseconds. System processing was approximately 184.1 seconds; the 743.4-second session wall clock includes deliberate review pauses. A second text-input repair passed after a laptop/model cold restart and fresh manual re-pair. The manual re-pair is the rehearsed recovery path; do not promise automatic cold reconnect.
