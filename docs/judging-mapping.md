# Judging mapping

This document maps the product strategy to evidence we intend to demonstrate. Only the Phase A foundation row is currently implemented; later rows are delivery commitments, not present-tense claims.

| Judging signal | Planned PocketPilot evidence | Delivery milestone | Current status |
| --- | --- | --- | --- |
| Product quality | Phone-first approval flow, readable diff, explicit progress, rollback, polished success state | M4–M10 | Planned |
| Technical depth | Typed state machine, persistent sequenced events, reconnect recovery, bounded context retrieval, provider abstraction, validated unified diffs | M2–M4 | M2 state/event control plane implemented |
| Creative smartphone usage | Camera-led error capture, editable device OCR, constrained voice actions, phone approval | M5, M7, M8 | Planned |
| AI / local open source | Configurable Ollama coding model, structured outputs, deterministic offline fallback clearly disclosed | M3 | Planned |
| Phone ↔ laptop workflow | Replaceable `DeviceBridge`, local Wi-Fi WebSocket, reconnect recovery, live event timeline | M2, M5 | Planned |
| Demo reliability | Resettable broken repositories, genuine tests, readiness checks, offline mode, bounded retries | M6, M9, M12 | Planned |
| Novel developer usefulness | Move from photographed laptop failure to reviewed and verified local patch without abandoning the phone | M6–M10 | Planned |
| Safety and trust | One workspace capability, sensitive-file protection, explicit command action, non-shell allowlisted runner; immutable patch approval follows in M4 | M1, M4 | M1 execution boundary implemented |
| Feasibility | Runnable Expo, FastAPI, and Vite foundations sharing strict contracts | M0 | Implemented in Phase A |
| iQOO differentiation | Verified Office Kit adapter if official access is available; robust WebSocket fallback regardless | M11 | Not implemented; documentation required first |

## North-star demo evidence

The final 2–3 minute demo must visibly prove each step rather than narrate it:

1. Trigger a real error in a deterministic laptop project.
2. Capture it with the iQOO phone and review extracted text if confidence is low.
3. Show detected error and concise root cause tied to a real file.
4. Present a minimal diff; prove no file changed before approval.
5. Approve on the phone and show the same patch/event on the laptop dashboard.
6. Run an allowlisted real test command and stream its output.
7. Show the real passing count and build status on the phone.
8. Explain the fix concisely and keep Undo available.

Claims about local inference, OCR, vendor APIs, test results, and rollback will be made only when the corresponding path is running in the demonstrated build.
