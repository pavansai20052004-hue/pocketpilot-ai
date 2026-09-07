# Three-minute PocketPilot hero demo

Primary: Python. Backup 1: React. Backup 2: Java after Maven preflight passes.

- **0:00–0:20 — problem.** “Debugging breaks your flow, especially when the error is on another screen. PocketPilot turns your phone into a private control surface.”
- **0:20–0:40 — real failure.** Run pytest and point out one failure, one pass, `NoneType`, file, and line.
- **0:40–1:00 — see it.** Scan the real terminal. Review and confirm the editable OCR text.
- **1:00–1:20 — understand it.** Analyze and show the repository-backed root cause.
- **1:20–1:40 — say it.** Say “Fix this.” Wait for the one-file patch.
- **1:40–2:00 — human review.** Point out the `None` guard and that nothing changed before approval.
- **2:00–2:20 — approve safely.** Say “Approve fix,” then “Yes.” Explain that revision, hash, and risk checks still apply.
- **2:20–2:40 — prove it.** Show the real `2 passed` result and **FIX VERIFIED**.
- **2:40–2:55 — explain.** Say “What changed?” and let the phone speak the bounded explanation.
- **2:55–3:00 — close.** “PocketPilot: see it, say it, fix it—locally, visibly, and under your control.”

Do not include rollback in the three minutes. During Q&A, undo and rerun pytest to prove the original failure returns.
