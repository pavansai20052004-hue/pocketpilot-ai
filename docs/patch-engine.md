# Safe patch engine

Milestone 4 turns a validated diagnosis into a controlled repair without granting the model write or execution privileges.

## Components

- `PatchProvider`: `MockPatchProvider` creates deterministic fixture proposals; `OllamaPatchProvider` requests structured JSON from an already-running local model. Neither receives filesystem services.
- `PatchPromptBuilder`: supplies the validated analysis, retry number, and only previously selected files. It forbids commands, deletion, secrets, unrelated rewrites, and claims about test success.
- `UnifiedDiffParser`: parses existing-file `a/` → `b/` hunks, verifies line counts, and builds a candidate result in memory without invoking `patch` or a shell.
- `PatchValidator`: checks supplied context, scanner eligibility, safe path resolution, SHA-256, dry-run applicability, declared counts, breadth, change ratio, lockfiles, and suspicious execution additions.
- `PatchEngine`: rechecks hashes, persists private originals, creates and flushes same-directory temporary files, atomically replaces targets, and verifies patched hashes.
- `ValidationCommandSelector`: selects only an existing registry entry, preferring test, typecheck, build, then lint. The existing `SafeProcessRunner` executes it with `shell=False`.
- Rollback manager behavior is contained in `PatchEngine`: restore is allowed only while current hashes equal the expected patched hashes.

## State and approval

```text
ROOT_CAUSE_FOUND → PATCH_GENERATED → AWAITING_APPROVAL
  → explicit patch ID + revision approval → PATCH_APPLYING
  → TESTING → SUCCESS | FAILED → optional ROLLED_BACK
```

Generation and dry-run validation never modify the repository. Rejection records `patch_rejected` and writes nothing. Approval is rejected for stale revisions, a non-current patch ID, invalid validation, or HIGH/BLOCKED risk.

## Persistence and recovery

SQLite stores the public proposal, risk validation, decision/status, application result, safe command result, rollback availability, and a private snapshot containing originals and original/patched hashes. Restart recovery exposes the full public workflow. An operation persisted as `APPLYING` becomes `RECOVERY_REQUIRED`; the service never infers success after uncertainty.

## Limits

Defaults allow at most five modified files, 100 added lines, and a 60% per-file change ratio. File deletion and creation are intentionally unsupported. Normal UTF-8 LF and CRLF files retain their existing newline convention. Git is not required, and PocketPilot never commits, stashes, or resets user work.
