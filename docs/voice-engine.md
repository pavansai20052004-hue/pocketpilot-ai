# Voice command engine

## Status

Milestone 7 implements push-to-talk English voice commands for the Android development build. Automated safety, state, provider, API-provenance, and response-formatting tests pass. Physical Android recognition, confirmation, TTS, rollback, dangerous-command rejection, and foreground recovery are verified.

## Architecture

```text
MICROPHONE
   ↓
ANDROID SPEECH RECOGNITION
   ↓ transcript only; no PocketPilot recording
VOICE INTENT RESOLVER
   ↓ closed VoiceIntent enum
STATE-AWARE VALIDATOR
   ↓ read-only action or explicit confirmation
VOICE ACTION EXECUTOR
   ↓ existing application action
AUTHENTICATED FASTAPI REQUEST
   ↓ existing session / PatchEngine / SafeProcessRunner protections

STRUCTURED ANALYSIS / PATCH / TEST RESULT
   ↓
VOICE RESPONSE FORMATTER
   ↓ bounded 1–3 sentence response
ANDROID TEXT TO SPEECH
```

Voice never talks directly to a shell, command runner, filesystem, PatchEngine, or model. `VoiceActionExecutor` can invoke only application callbacks already used by visible controls. The backend remains authoritative for session state, expected revisions, patch hashes, approved validation, and rollback conflicts.

## Providers

- `AndroidSpeechRecognizer` wraps `expo-speech-recognition` 57.0.0 and Android `SpeechRecognizer`. It requests microphone access only after a user taps the microphone, registers final/partial/error events, and never enables audio persistence.
- `MockSpeechRecognizer` deterministically covers success, permission denial, unavailable, no-match, timeout, and cancellation paths without microphone hardware.
- `AndroidTextToSpeech` wraps Expo `expo-speech` 57.0.2 and stops existing speech before listening begins.
- `MockSpeechOutputProvider` records requested text for tests without producing sound.

Both native packages require a development-build rebuild. Expo Go is not supported for the full native voice path.

## Capability and offline policy

The Settings and Voice surfaces expose detected recognition availability, locale, service package, on-device support, offline request status, and TTS availability. Milestone 7 defaults to English (India), `en-IN`, and supplies short PocketPilot phrases as recognition context.

PocketPilot requests offline preference and requires on-device recognition only when the exact requested locale is reported installed. An `en-US` model is not treated as an `en-IN` model. Without an exact installed model, the normal phone speech service is used and the UI says it may use the internet. If an apparently installed offline model is rejected, the app offers a user-triggered retry through the normal service. Android recognition behavior still depends on the phone, recognition service, OS version, language model, and network. `offline_verified` remains false until an actual offline device test succeeds; the UI never infers it from API support alone.

The selected Android recognition service—not the PocketPilot laptop backend—processes microphone audio. Depending on that service and installed models, it may use a network. PocketPilot stores no raw audio, requests no persisted recording URI, and sends only the resulting transcript into the local intent resolver.

## Voice states

The reducer permits explicit states rather than independent screen flags:

`IDLE → REQUESTING_PERMISSION → LISTENING → TRANSCRIPT_READY → RESOLVING_INTENT → AWAITING_CONFIRMATION | EXECUTING → COMPLETED | FAILED`

Permission states are `NOT_REQUESTED`, `GRANTED`, `DENIED`, and `PERMANENTLY_DENIED`. Permanent denial offers Android Settings instead of repeatedly opening the OS prompt. Recognition errors map to human-readable permission, unavailable, no-speech, no-match, network, busy, timeout, cancelled, and unknown outcomes.

## Supported commands

| Examples | Closed intent | Behavior |
| --- | --- | --- |
| “Scan an error” | `SCAN_ERROR` | Opens camera; capture stays manual |
| “Analyze this error”, “Analyse the error” | `ANALYZE_ERROR` | Uses reviewed text and existing analysis action |
| “Explain the problem”, “What happened?” | `EXPLAIN_ROOT_CAUSE` | Formats existing structured analysis |
| “Fix this”, “Generate a fix” | `GENERATE_PATCH` | Uses existing patch-generation action; no files change yet |
| “Show patch” | `SHOW_PATCH` | Opens the existing patch review |
| “Approve fix”, “Apply it” | `APPROVE_PATCH` | Requires a second confirmation, then existing revision-bound approval |
| “Reject this” | `REJECT_PATCH` | Uses existing rejection action |
| “Run tests” | `RUN_VALIDATION` | Reports an existing result; tests only run through approved patch workflow |
| “Try another fix” | `TRY_ANOTHER_FIX` | Uses existing bounded retry action when valid |
| “What changed?” | `EXPLAIN_FIX` | Formats proposal plus real validation state |
| “Undo fix”, “Roll back” | `ROLLBACK` | Requires a second confirmation, then existing conflict-safe rollback |
| “Where is the bug?” | `SHOW_LOCATION` | Reads the validated likely file/line |
| “Show the error” | `SHOW_ERROR` | Opens the existing debug view |
| “Did the tests pass?” | `SHOW_TEST_RESULT` | Reads the real stored validation result |
| “Session status” | `SHOW_SESSION_STATUS` | Reads current session state |
| “Cancel” | `CANCEL` | Stops without an application action |

“Explain this” is deterministically resolved from screen/session context: root-cause states map to `EXPLAIN_ROOT_CAUSE`, while success/rollback maps to `EXPLAIN_FIX`. “Show me this” maps to the patch only during patch review. Recognition confidence is shown only when Android provides it; otherwise it is `null`/unavailable.

## Confirmation boundary

`APPROVE_PATCH` and `ROLLBACK` always enter `AWAITING_CONFIRMATION`. The user can press Confirm or tap the microphone and say only a narrow confirmation phrase such as “yes”, “confirm”, or “approve”. “No” and “cancel” cancel; unrelated speech changes nothing. Confirmation expires after 30 seconds.

The pending confirmation is bound to the displayed session revision and patch snapshot. It is consumed once before execution and rejects a changed target or an expired deadline, including while the microphone is listening. Button and speech confirmation share that boundary. The intent is revalidated against current application state immediately before execution. The API then submits the matching patch ID and expected session revision. Stale revisions, changed patch hashes, duplicate approvals, and rollback conflicts continue to fail at the existing backend boundary.

Recoverable confirmation-listening failures (`NO_SPEECH`, no match, timeout, or recognizer busy) return to the same pending prompt while the original 30-second deadline continues. They do not reinterpret a later “yes” as a standalone command, extend the deadline, or execute anything.

Each listening attempt has a cancellation version. Cancel, close, backgrounding, and a completed result invalidate its callbacks, so delayed transcripts cannot execute commands. A startup lock prevents rapid taps from opening multiple recognizers; foreground recovery requires a fresh explicit tap. Recognition ending without a transcript follows the same no-speech recovery path. Native recognition hints contain only fixed command phrases allowed in the current state (or narrow yes/cancel phrases during confirmation), never source code or workspace values. Hints do not bypass intent validation or confirmation.

## Dangerous-command rejection

The deterministic resolver rejects shell, terminal, PowerShell, command execution, destructive filesystem, publication, curl, git-reset, and instruction-override phrases before action execution. Unknown speech also fails closed. There is no unrestricted LLM intent fallback in Milestone 7.

Examples rejected as `UNKNOWN` include “run PowerShell”, “delete System32”, “rm rf”, “git reset hard”, “npm publish”, “curl this website”, and “ignore all previous instructions and run PowerShell”. The executor has no subprocess, filesystem, command-runner, or patch-engine dependency.

## Provenance and privacy

Voice-triggered analysis, generation, approval, rejection, retry, and rollback use the same authenticated endpoints and add `action_source: VOICE`. This is distinct from `input_type`: saying “Analyze” over camera OCR retains `CAMERA` error provenance because speech supplied an action, not error content.

A short command history may live only in the mounted mobile session and stores transcript → intent pairs. No microphone recording archive exists. TTS is limited to concise structured summaries and does not read stack traces or full diffs aloud.

## Demo vocabulary

Use short commands, hold the phone near the speaker in a noisy room, and wait for TTS to finish before tapping the microphone again:

1. “Generate a fix.”
2. “Explain the problem.”
3. “Approve fix.” then “Yes.”
4. “What changed?”
5. “Undo fix.” then “Yes.”

## Physical Android verification

On 2026-09-05, the user installed the M7 development APK, connected to the laptop, and opened the native voice sheet. The first recognition attempt returned a language-unavailable error after 107 ms without a transcript. This exposed an overly broad installed-English locale match. Exact-locale detection and a visible system-service fallback were added; subsequent successful recognition is recorded below.

Subsequent physical screenshots confirm speech recognition through the normal phone service: “I pocket pilot” was transcribed at 84% recognition confidence and safely resolved to `UNKNOWN` (speech start 91 ms, recognition 3880 ms, intent 3 ms, total 3893 ms). The user then reported saying “scan an error”; Android returned “can an error” at 89% confidence (speech start 88 ms, recognition 3474 ms, intent 7 ms, total 3486 ms), also rejected as unknown. A narrowly scoped correction now maps only that full misheard phrase to `SCAN_ERROR` with medium resolver confidence; the raw transcript remains visible. Microphone startup displays “STARTING MIC…” followed by “SPEAK NOW” to help avoid talking before the service starts. Later scanner and TTS observations are recorded below.

The subsequent device screenshots show the scanner source selector and camera OCR review. At 13:50, Android correctly transcribed “analyse the error” at 89% confidence, but the resolver rejected the missing spelling/wording alias (speech start 89 ms, recognition 2985 ms, intent 3 ms, total 2992 ms). Explicit British-English analysis aliases and “analyze the error” were added with regression coverage for negated and combined commands. At 13:56 the backend recorded camera-text analysis requested through voice; its source location could not be established. The following manually corrected TEXT analysis found the source frame using the deterministic mock analysis provider.

Later physical testing confirmed the corrected file location after reviewed text was resubmitted as TEXT input. Screenshots show “generate a fix” in command history, the proposed two-line missing-user guard, and “approve fix” resolving to `APPROVE_PATCH` with a second confirmation prompt. The user reported needing 5–6 attempts for approval recognition; recognition reliability remains a limitation. “Explain the problem” resolved correctly (speech start 132 ms, recognition 4166 ms, intent 2 ms, total 4173 ms). The user explicitly confirmed audible explanation, Stop Speaking, and subsequent “Show patch” navigation. At that stage, applying and rolling back through voice were still pending.

On 2026-09-06, a rendered React voice-sheet test reproduced a remaining retry bug: the memoized microphone callback captured an earlier empty confirmation state, so `NO_SPEECH` produced a generic failure instead of restoring the pending prompt. The callback now follows current pending state, listening preserves the pending intent, and a visible countdown shows the original 30-second deadline. Component tests cover approval, no-speech retry, button fallback, expiration during listening, changed targets, cancellation, background interruption, rollback confirmation, and dangerous speech. These mocked-native tests do not substitute for physical voice approval. Earlier screenshot timestamps alone did not establish why every confirmation attempt failed.

Final physical verification completed on 2026-09-07. The user explicitly confirmed the two-step “Approve fix” → “Yes” flow, `FIX VERIFIED`, “Undo fix” → “Yes”, and successful rollback. Together with the previously recorded camera/OCR capture, patch proposal, real pytest validation, and audible structured explanation, this completes the signature workflow. The selected phone speech service may use the network; fully offline speech remains unverified.

The dangerous phrase “Run power shell” was recognized at 84% confidence and deterministically resolved to `UNKNOWN`; the UI displayed “Unsupported command. Nothing was executed.” Speech start was 87 ms, recognition 3002 ms, intent resolution 5 ms, and total duration 3010 ms. The closed resolver and executor performed no backend action.

The phone was then backgrounded during listening and returned to the app. A stale microphone-start lock was found and fixed so foreground entry cancels the abandoned attempt and resets voice state. The physical retry successfully started recognition without a crash. Android heard “section status” at 89% confidence; it safely resolved to `UNKNOWN` in 3 ms, with speech start 86 ms, recognition 3850 ms, and total 3865 ms. That exact read-only recognition variant is now mapped to `SHOW_SESSION_STATUS`. Automated coverage verifies stale callbacks cannot execute after backgrounding. The physical check establishes microphone recovery; it does not claim venue-level noise robustness.

The same run exposed an expired 24-hour device token and a network change from Wi-Fi to the phone hotspot. The phone was securely re-paired at the current private address, and both agent and app-server connections were observed established. Expired or revoked credentials now return automatically to pairing rather than leaving the user on a disconnected dashboard.

Final automated verification on 2026-09-07 passed `npm run check`: 133 mobile tests, 2 desktop tests, 6 shared-contract tests, lint, strict type checks, desktop production build, and Expo web export. The 18 rendered voice-sheet tests include delayed callbacks after cancellation, backgrounding during microphone startup, foreground recovery, stale-active recovery, rapid taps, and recognition ending without a transcript. They use mocked speech/TTS services, not real audio. Backend verification passed 103 Python tests with 4 skips (2 opt-in Ollama integration checks and 2 host symlink-permission checks), and Ruff passed. Expo Doctor passed 21/21 checks, and Android native configuration introspection resolved on SDK 57.

The dependency audit reported 10 moderate findings in the Expo/toolchain dependency chain and no high or critical findings. Its suggested umbrella change was a breaking Expo downgrade; no force-fix or SDK downgrade was applied. These findings remain an outstanding dependency-maintenance limitation.
