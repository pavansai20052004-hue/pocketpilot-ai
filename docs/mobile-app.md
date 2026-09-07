# PocketPilot mobile app

## Product role

The Android app is the primary PocketPilot experience. It pairs to a local laptop agent, captures or imports an error for on-device OCR, accepts pasted text, follows real events, reviews actual unified diffs, approves or rejects a revision-bound patch, displays real validation, and requests conflict-safe rollback. The desktop remains the workspace and device-administration surface.

Camera/OCR and the safe voice workflow are implemented and physically verified in a native Android development build. Voice approval, real validation, TTS, rollback, dangerous-command rejection, and foreground recovery were completed by 2026-09-07. iQOO Office Kit remains unimplemented.

## Architecture

- `src/api`: centralized base URL, bearer headers, 10-second timeouts, typed errors, JSON handling, and focused resource clients.
- `src/auth/secureStorage.ts`: Expo SecureStore on Android; memory-only behavior on web; no AsyncStorage fallback.
- `src/bridge/DeviceBridge.ts`: `LocalWebSocketBridge`, dev-only `MockDeviceBridge`, and a clearly unimplemented `OfficeKitBridge` stub.
- `src/bridge/PocketPilotSocket.ts`: authentication, session subscription, last sequence, duplicate suppression, snapshot reconciliation, and bounded reconnect.
- `src/state/workflow.ts`: reducer-owned connection, workspace, active session, events, analysis, patch, and verification state.
- `src/vision`: capture/OCR abstractions, camera/gallery UI, preprocessing, normalization, quality/privacy checks, editable review, and cache cleanup.

Navigation uses four touch-friendly tabs: Home, Debug, Sessions, and Settings. The Debug tab contains the session flow so analysis, patch, test, success/failure, and rollback states remain coherent.

## Presentation Mode

Presentation Mode is enabled by default for the hackathon build and can be toggled in Settings. It is a cleaner view over the same authenticated APIs—not a simulated demo. Home prioritizes live laptop/workspace/provider/camera/voice status, **Scan Error**, visible speech and paste fallbacks, registered demo preparation, and an explicit distinction between **New Session** and **Reset Demo**.

Root cause, patch, approval, test, and success states use concise judge-readable headings. The approval card displays the real registered validation command and keeps a prominent tap confirmation beside voice. **FIX VERIFIED** reports the real command output, changed-file count, actual provider type, diff, explanation, and conflict-safe undo.

On launch or foreground, the app restores the latest meaningful persisted session from the laptop and reconciles missing analysis/patch events. A disconnect during testing does not trigger a second approval or test run.

**Scan Error** opens a local vision flow above normal tab navigation. Camera permission denial offers retry, gallery fallback, and Android Settings recovery when the OS no longer allows prompting. A captured image remains local through guide crop/rotation and ML Kit recognition. The user must edit or confirm the extracted text before `ANALYZE ERROR` can call the existing session API.

## Push-to-talk voice

**Speak Command** opens the voice sheet from Home, and the active Debug screen exposes a contextual microphone. The sheet detects the Android recognition service, requests microphone permission only after a tap, displays partial/final transcription, reports confidence only when supplied by Android, and resolves a closed English command set. Presentation Mode displays suggested phrases but never injects canned recognition or actions.

Read-only commands can respond immediately from existing structured analysis, patch, session, and test data. “Fix this” uses the same Generate Fix function as the button. “Approve fix” and “Undo fix” pause for a second button or narrow voice confirmation before calling the same revision-bound API functions as their visible controls. Confirmation expires after 30 seconds, and current state is checked again before execution.

The UI includes permission-denied and permanent-denial recovery, recognizer unavailable/no-speech/no-match/network/busy/timeout/cancelled messages, a Stop Speaking control, short local transcript-to-intent history, and measured recognition/resolution/action/TTS timing fields. It does not store microphone audio. Recognition may use the phone speech service’s network unless on-device operation is physically verified; camera, OCR, and manual input remain available when voice is not.

## Pairing

1. Start the agent on the laptop with `--host 0.0.0.0` only when LAN access is needed.
2. Select an explicit workspace in the desktop dashboard.
3. Generate a code in **Device Connection**.
4. Enter the displayed `address:port`, six-digit code, and device name on the phone.
5. The app exchanges the code once and stores the returned opaque token in Android secure storage.

Codes expire in five minutes, permit five guesses, and are single-use. Device tokens expire after 24 hours by default. Revoking a device on the desktop invalidates its next HTTP request and WebSocket connection immediately. An expired or revoked credential is removed from secure storage and returns the app directly to secure pairing instead of leaving an unusable disconnected dashboard.

## Local network setup

Phone and laptop must be on the same private network and client isolation must be disabled. PocketPilot does not modify Windows Firewall. If Windows prompts, the developer must manually approve private-network access. Do not approve public-network access and do not expose port 8000 through a router or public tunnel.

Manual address entry is the reliable path. Automatic discovery is intentionally deferred. If the laptop is unreachable, confirm the agent is running, use the laptop's private IPv4 address, confirm both devices share Wi-Fi, and check the manually approved firewall scope.

## Live events and reconnection

The mobile WebSocket sends the token as its first private message and includes only the greatest processed `after_sequence` for that session in the URL, preventing credential leakage through access logs. Switching sessions resets the cursor and ignores late messages from the previous socket. It receives no snapshot before authentication. Duplicate or older sequences are discarded. Disconnects retry after 1, 2, 4, 8, then at most 15 seconds. A `4401` or `4403` authentication close stops retries and asks the user to pair again.

When Android backgrounds the app, the socket may close normally. On foreground, the bridge reconnects, the dashboard metadata refreshes, and the active session/analysis/patch is reconciled from the server. The phone never relies solely on transient socket delivery.

## Demo setup

Select `demo/python-broken-app` on the desktop. Enable Demo Mode in mobile Settings and choose **Load Demo Error** on the Debug tab. This fills only the text and language hint. Session creation, context selection, analysis, patch generation, approval, file writes, pytest verification, and rollback still execute against the real backend.

## Physical Android run

Without a local Android SDK, use the checked-in EAS development profile:

```powershell
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client --lan
```

Install the internal APK from its EAS build page. Keep the phone and laptop on the same private Wi-Fi, start the agent with `--host 0.0.0.0`, and enter the laptop's private IPv4 address during pairing.

For the Android SDK/ADB path:

```powershell
cd apps/mobile
npm run android
npm run android:metro
```

The first local command creates/installs the native development build and needs Android SDK, ADB, and an attached phone or emulator. Expo Go cannot load the native OCR module.

The focused physical run on 2026-09-04 used EAS development build `1a716796-9260-44bd-a463-80faed4dcceb`. A real Android phone launched and paired, camera/flash/capture/retake/portrait/landscape/crop/full-image processing worked, and native terminal OCR recovered 7/7 selected critical tokens in 375 ms. Confirmed camera text completed root cause → patch review → explicit approval → real `2 passed` verification in 530 ms → exact rollback, then recovered the `ROLLED_BACK` session after restart. A blank capture returned `POOR · 0/100` in 830 ms and disabled Analyze. The handset model and Android version were not recorded.

The hardware run found one usability issue: a floating phone system/development overlay covered the top-right flash/close target. The camera and scanner headers now reserve that area, and the phone confirmed the controls were accessible after hot reload. Full-image OCR also captured unrelated Windows UI and corrupted some non-critical punctuation, so guided crop and editable review remain important.

Gallery import, denial/settings recovery, airplane-mode OCR, direct cache-file inspection, and every fixture in `demo/vision-fixtures` were not part of this focused physical run. Report those checks separately rather than inferring them from the verified camera golden path.
