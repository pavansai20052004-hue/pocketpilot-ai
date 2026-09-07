# Desktop-agent security model

## Scope and trust boundary

Milestone 1 grants the local FastAPI process two bounded capabilities after an explicit user action:

1. inspect metadata beneath one selected repository root;
2. execute one registry-generated build/test/typecheck/lint action after a separate explicit request.

The selected repository is trusted as developer-controlled code, but it is not assumed to be free of secrets, generated files, symlinks, or hostile filenames. Package scripts and test code can themselves execute code; therefore command buttons are approval boundaries, not passive inspection. CORS is limited to configured dashboard origins. LAN binding is supported only with the device-authentication boundary below.

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

## LAN pairing and device tokens

The LAN threat model assumes another device on the local network may discover the agent port. All non-loopback workspace, command, session, analysis, patch, and WebSocket access therefore requires a valid device credential. Health and pairing exchange remain public; pairing-code generation, device listing, and revocation are restricted to a direct loopback client.

Pairing codes use a cryptographic random generator, contain six digits, live only in process memory, expire after five minutes by default, permit five guesses, and are consumed after one successful exchange. Regeneration invalidates the previous code. Codes are never written to SQLite or event history.

Successful pairing returns a 32-byte opaque token with a device ID, creation/expiry timestamps, and a fixed prototype permission set. The server stores only SHA-256 token hashes plus minimal device metadata. Android stores the token, address, and device ID in Expo SecureStore; web development keeps them only in memory and never falls back to plain AsyncStorage. Source code, error context, and rollback snapshots are not stored on the phone.

Authentication updates `last_seen`. Expired and unknown tokens receive `401`; revoked tokens receive `403` or WebSocket close `4403`. Every HTTP action is revalidated, and active sockets revalidate before each event and at least every five seconds, so revocation promptly disconnects an idle phone. The phone cannot select or browse filesystem paths: only the explicit workspace selected on the laptop is exposed as bounded metadata.

## Known limitations

- Milestone 1 stores the current workspace and completed run results in memory; process restart clears them.
- Runs are synchronous. A user cancellation endpoint and live streaming belong to Milestone 2; timeout termination is implemented now.
- The prototype uses direct HTTP/WebSocket on a trusted private LAN rather than TLS. Do not expose the port through router forwarding, public Wi-Fi, or an untrusted tunnel.
- File content retrieval is intentionally absent.
- Reparse/symlink tests may skip on Windows hosts that do not permit creating test links; production scanning still checks the reparse attribute.
- Package-manager scripts are repository code and may perform arbitrary behavior despite having an allowed name. Explicit user approval and repository trust are required.

## Session and event integrity

Session state is stored locally in SQLite. Every mutation requires the exact current revision, follows the central transition table, increments the revision and event sequence once, and commits the session/event pair atomically. Invalid, stale, or retry-exhausted transitions return a conflict and append nothing.

WebSockets do not mutate state. They publish database-backed snapshots and sequenced events; reconnecting clients recover from SQLite after the last acknowledged sequence. LAN sockets must authenticate in their first message before any snapshot or event is released, while loopback remains trusted for the desktop. Keeping the token out of the URL prevents access-log leakage. The in-process broker caps each subscriber queue at 100 events and may drop transient delivery under pressure because persistent cursor recovery remains authoritative.

The current event summaries are user/agent-supplied bounded text. They must not contain secrets or source bodies; richer redacted debug payloads will require explicit schemas in later milestones.

## Local AI trust boundary

Milestone 3 treats pasted errors, repository content, and provider responses as untrusted data. Context collection starts from the Milestone 1 metadata index, repeats sensitive/binary/reparse checks, resolves each relative path beneath the selected root, and reads only scored line windows. Defaults are 6 files, 24,000 characters, and 80 lines per file; truncation is recorded on the analysis.

System instructions are sent separately from clearly delimited error and repository data. They forbid patches, scripts, commands, file modification, invented references, and chain-of-thought. Prompt-injection-like source remains data. Output must pass a strict schema; references outside supplied context are removed and confidence is reduced before persistence.

Analysis and execution are separate dependency graphs. `AnalysisService` has no `SafeProcessRunner`, command registry, patch service, or filesystem write interface. A provider response can only become a validated `AnalysisResult`; it cannot enter argv, select a safe command, or mutate a file. Ollama traffic targets only the configured local URL. No cloud provider, telemetry, download, or model-pull path exists.

Raw error text and source windows are used transiently and are not stored in event logs or the analysis table. Concise parsed facts, validated conclusions, context metadata, and timings are local SQLite records. The dashboard explicitly labels mock mode.

## Human-approved patch boundary

AI output is an untrusted proposal. The provider cannot access `WorkspaceService`, `SafeProcessRunner`, or filesystem write methods. A strict parser accepts only existing-file unified diffs and rejects absolute/traversal paths, `/dev/null`, create/delete/rename metadata, binary patches, malformed counts, multi-target content, and non-matching hunks.

Validation reuses the selected-workspace resolver and scanner classification. Every file must have been supplied to the provider context, remain indexed and eligible, avoid secrets/generated content/lockfiles, and match a captured SHA-256. Explainable risk rules block excessive breadth and additions of shell/process/eval behavior. HIGH and BLOCKED patches cannot reach approval.

Approval names both the patch ID and exact session revision. Immediately before writing, every hash and hunk is checked again. The engine constructs all outputs in memory, persists PocketPilot-owned originals, flushes same-directory temporary files, and atomically replaces targets. A multi-file failure restores already-replaced originals.

Tests run only after apply and only by selecting an immutable command already created by `SafeCommandRegistry`; no provider string enters argv. Rollback checks the current bytes against the stored patched hash before restoring. Any later developer edit produces `ROLLBACK_CONFLICT` and remains untouched. Event logs contain file names/status metadata, never source or rollback bodies.

## Camera and OCR privacy boundary

Milestone 6 adds phone-local image capability without adding an image endpoint. Camera and gallery assets are passed only to Expo preprocessing and the bundled native ML Kit recognizer. The API request schema still accepts text; mobile source inspection and tests assert that neither image bytes nor `file://`/`content://` URIs enter the request. The server persists `input_source` for provenance but does not persist raw OCR or confirmed raw error text.

Image ownership is explicit. Camera captures and every preprocessed derivative are app-temporary and are deleted best-effort after close, retake, or successful analysis handoff. A gallery selection is marked external and is never deleted; only its derived cache image is removed. Preprocessing emits a fresh JPEG rather than sending original metadata into OCR or transport. Temporary images remain on the phone if deletion fails at the OS boundary, so Android application storage clearing is the recovery mechanism for that residual risk.

OCR output is untrusted user input. Conservative normalization does not guess ambiguous alphanumeric characters. A deterministic postprocessor can trim only a short non-technical prefix before a clear error anchor and records that action as a warning. Secret-like strings and instruction/prompt-injection patterns are highlighted before analysis. No warning automatically edits, executes, uploads, or approves anything, and the user must explicitly confirm editable text before the authenticated analysis call.

The offline-bundled Latin model avoids first-run model download and cloud OCR. The development build still depends on Android/Google ML Kit native compatibility; Expo Go and the web export cannot execute OCR. Physical network-off and cleanup behavior must be verified on the target device before claiming an end-to-end privacy pass.

## Voice command security boundary

Milestone 7 adds push-to-talk speech as an input to a closed application-action interface, not as a command language. The Android recognition adapter produces a transcript only. A deterministic resolver can return only a declared `VoiceIntent`; shell, terminal, PowerShell, curl, publishing, destructive filesystem, git-reset, and instruction-override phrases are rejected as `UNKNOWN`. There is no unrestricted AI fallback.

The state validator checks the current session, patch status, available structured records, and retry count. Read-only explanations use stored validated data. Patch generation invokes the existing mobile callback but cannot write. Approval and rollback require a second confirmation that accepts only narrow yes/no phrases and expires after 30 seconds. Immediately before execution, the intent is revalidated, after which the existing authenticated endpoint still enforces patch ID, expected revision, risk, hashes, safe validation selection, and rollback conflicts.

`VoiceActionExecutor` has no API-client, filesystem, subprocess, `PatchEngine`, or `SafeProcessRunner` dependency. It can call only the same application functions used by buttons. Requests record `action_source: VOICE` separately from `input_type`, so a voice instruction over camera OCR does not relabel the error content.

PocketPilot does not request persisted recognition recordings, retain raw audio, or send audio to the laptop. The selected Android recognition service receives microphone audio and may use its network according to device/service settings. Offline preference or reported on-device support is not documented as verified until a real network-off test passes. Starting recognition stops PocketPilot TTS first, preventing simultaneous self-listening.
