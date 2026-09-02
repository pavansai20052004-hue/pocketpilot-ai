# Desktop-agent security model

## Scope and trust boundary

Milestone 1 grants the local FastAPI process two bounded capabilities after an explicit user action:

1. inspect metadata beneath one selected repository root;
2. execute one registry-generated build/test/typecheck/lint action after a separate explicit request.

The selected repository is trusted as developer-controlled code, but it is not assumed to be free of secrets, generated files, symlinks, or hostile filenames. Package scripts and test code can themselves execute code; therefore command buttons are approval boundaries, not passive inspection. The API remains bound to loopback in the documented startup command and CORS is limited to configured local dashboard origins.

## Workspace boundary

`SafePathResolver` canonicalizes the selected root and rejects missing files, non-directories, parent-traversal segments, filesystem roots, and known operating-system directories. Every later child path must be relative, contain no `..`, and resolve to the same canonical root under `os.path.commonpath` using platform path normalization.

Directory scanning does not follow symbolic links. On Windows it also inspects file attributes and skips reparse points, covering junction-style escapes where the filesystem reports them. A user may explicitly select another ordinary repository, but no operation can escape the currently selected one.

## File exclusion policy

The scanner never descends into `.git`, dependency trees, virtual environments, IDE data, caches, or common build outputs. Archives, databases, executables, media, compiled objects, and oversized files are classified as generated and never read.

Likely secrets—including `.env`, `.env.*`, private-key formats, SSH identities, credentials files, and service-account JSON—are classified as `excluded_sensitive`. The file index may expose relative path, size, timestamp, and category so exclusions are auditable; it has no content field. Framework detection reads only bounded, known manifest names after this policy approves them.

Default scan limits:

| Limit | Default |
| --- | ---: |
| Files | 20,000 |
| Individual file considered readable | 1 MiB |
| Aggregate scanned metadata size | 100 MiB |

When a repository reaches a bound, `scan_truncated` is returned instead of continuing indefinitely or failing the process.

## Command allowlist

API clients cannot submit an executable, arguments, working directory, or shell command. They can submit only a command ID created for the current workspace by `SafeCommandRegistry`.

Registry templates are versioned in code:

- Maven: test, quiet test, package with tests skipped;
- Gradle: test and build;
- npm/pnpm/yarn: exact package scripts named `test`, `build`, `typecheck`, or `lint` only;
- Python: `python -m pytest -q` only when tests and Python project evidence exist.

Scripts such as `deploy`, `publish`, `prepare`, `preinstall`, and `postinstall` are not registered. Unknown IDs and injection-like text fail lookup before process creation. A selected repository can still define hostile code behind an allowed script name, so the dashboard shows the exact action and requires a click; repository trust and explicit approval remain necessary.

## Process execution

`SafeProcessRunner` re-resolves the registry-owned working directory beneath the selected root and executes `[executable, *args]` with `shell=False` and stdin disconnected. User or future model text is never interpolated into argv.

The runner:

- resolves executables before launch and returns `NOT_AVAILABLE` cleanly;
- creates a process group/session where supported;
- terminates timed-out processes and their child tree where practical;
- drains stdout and stderr concurrently to prevent pipe deadlock;
- retains only a configured maximum number of bytes while continuing to drain excess output;
- decodes invalid UTF-8 with replacement;
- returns exit code, status, duration, timestamps, timeout flag, and separate stdout/stderr.

On Windows, npm is invoked through `node.exe` and its fixed `npm-cli.js` entrypoint so the outer runner does not need a command shell. Gradle/Maven wrapper filenames are platform-specific and all subprocess calls still set `shell=False`.

## Security verification

Automated tests attempt nonexistent roots, `..` traversal, absolute child paths, out-of-root working directories, Windows system-root selection, unknown IDs, shell/injection-like IDs, unsafe package script names, symlink escapes where host permissions permit, output floods, missing executables, non-zero exits, and timeouts. API assertions also verify that error responses do not contain Python tracebacks and sensitive index records have no content.

## Known limitations

- Milestone 1 stores the current workspace and completed run results in memory; process restart clears them.
- Runs are synchronous. A user cancellation endpoint and live streaming belong to Milestone 2; timeout termination is implemented now.
- No authentication or LAN pairing exists yet, so the agent should remain loopback-only.
- File content retrieval is intentionally absent.
- Reparse/symlink tests may skip on Windows hosts that do not permit creating test links; production scanning still checks the reparse attribute.
- Package-manager scripts are repository code and may perform arbitrary behavior despite having an allowed name. Explicit user approval and repository trust are required.

## Session and event integrity

Session state is stored locally in SQLite. Every mutation requires the exact current revision, follows the central transition table, increments the revision and event sequence once, and commits the session/event pair atomically. Invalid, stale, or retry-exhausted transitions return a conflict and append nothing.

WebSockets do not authorize or mutate state. They publish database-backed snapshots and sequenced events; reconnecting clients recover from SQLite after the last acknowledged sequence. The in-process broker caps each subscriber queue at 100 events and may drop transient delivery under pressure because persistent cursor recovery remains authoritative.

The current event summaries are user/agent-supplied bounded text. They must not contain secrets or source bodies; richer redacted debug payloads will require explicit schemas in later milestones.
