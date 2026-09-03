# PocketPilot mobile app

## Product role

The Android app is the primary PocketPilot experience. It pairs to a local laptop agent, displays the laptop-approved workspace, starts text debugging sessions, follows real events, reviews actual unified diffs, approves or rejects a revision-bound patch, displays real validation, and requests conflict-safe rollback. The desktop remains the workspace and device-administration surface.

Camera/OCR, voice control, and iQOO Office Kit are not implemented. Their buttons are disabled and labelled with their future milestone.

## Architecture

- `src/api`: centralized base URL, bearer headers, 10-second timeouts, typed errors, JSON handling, and focused resource clients.
- `src/auth/secureStorage.ts`: Expo SecureStore on Android; memory-only behavior on web; no AsyncStorage fallback.
- `src/bridge/DeviceBridge.ts`: `LocalWebSocketBridge`, dev-only `MockDeviceBridge`, and a clearly unimplemented `OfficeKitBridge` stub.
- `src/bridge/PocketPilotSocket.ts`: authentication, session subscription, last sequence, duplicate suppression, snapshot reconciliation, and bounded reconnect.
- `src/state/workflow.ts`: reducer-owned connection, workspace, active session, events, analysis, patch, and verification state.

Navigation uses four touch-friendly tabs: Home, Debug, Sessions, and Settings. The Debug tab contains the session flow so analysis, patch, test, success/failure, and rollback states remain coherent.

## Pairing

1. Start the agent on the laptop with `--host 0.0.0.0` only when LAN access is needed.
2. Select an explicit workspace in the desktop dashboard.
3. Generate a code in **Device Connection**.
4. Enter the displayed `address:port`, six-digit code, and device name on the phone.
5. The app exchanges the code once and stores the returned opaque token in Android secure storage.

Codes expire in five minutes, permit five guesses, and are single-use. Device tokens expire after 24 hours by default. Revoking a device on the desktop invalidates its next HTTP request and WebSocket connection immediately.

## Local network setup

Phone and laptop must be on the same private network and client isolation must be disabled. PocketPilot does not modify Windows Firewall. If Windows prompts, the developer must manually approve private-network access. Do not approve public-network access and do not expose port 8000 through a router or public tunnel.

Manual address entry is the reliable path. Automatic discovery is intentionally deferred. If the laptop is unreachable, confirm the agent is running, use the laptop's private IPv4 address, confirm both devices share Wi-Fi, and check the manually approved firewall scope.

## Live events and reconnection

The mobile WebSocket sends the token as its first private message and includes only the greatest processed `after_sequence` in the URL, preventing credential leakage through access logs. It receives no snapshot before authentication. Duplicate or older sequences are discarded. Disconnects retry after 1, 2, 4, 8, then at most 15 seconds. A `4401` or `4403` authentication close stops retries and asks the user to pair again.

When Android backgrounds the app, the socket may close normally. On foreground, the bridge reconnects, the dashboard metadata refreshes, and the active session/analysis/patch is reconciled from the server. The phone never relies solely on transient socket delivery.

## Demo setup

Select `demo/python-broken-app` on the desktop. Enable Demo Mode in mobile Settings and choose **Load Demo Error** on the Debug tab. This fills only the text and language hint. Session creation, context selection, analysis, patch generation, approval, file writes, pytest verification, and rollback still execute against the real backend.

## Physical Android run

```powershell
npm run dev:mobile
```

Open the Expo QR code on the iQOO phone. Verify pairing, workspace status, root-cause scrolling, horizontal/collapsible diff rendering, approval, verification, undo, Wi-Fi interruption recovery, and foreground recovery. A physical device is not required by CI; report it as skipped when hardware is unavailable rather than inferring a pass from the web export.
