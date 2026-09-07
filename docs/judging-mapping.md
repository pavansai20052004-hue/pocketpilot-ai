# Judging mapping

This document maps the product strategy to evidence we intend to demonstrate. Status is evidence-based: software paths may be implemented while physical-device proof remains pending.

| Judging signal | Planned PocketPilot evidence | Delivery milestone | Current status |
| --- | --- | --- | --- |
| Product quality | Phone-first approval flow, readable diff, explicit progress, rollback, polished success state | M4–M9 | Implemented; polished physical presentation and rollback verified |
| Technical depth | Typed state machine, persistent sequenced events, reconnect recovery, bounded context retrieval, provider abstraction, validated unified diffs | M2–M4 | Implemented and regression-tested |
| Creative smartphone usage | Camera-led error capture, editable device OCR, constrained voice actions, phone approval | M5–M7 | Implemented and verified on the physical iQOO phone |
| AI / local open source | Configurable Ollama coding model, structured outputs, deterministic fallback clearly disclosed | M3, M9 | Provider abstraction implemented; Ollama is not installed on this laptop, so the presentation currently uses the labeled deterministic provider |
| Phone ↔ laptop workflow | Replaceable `DeviceBridge`, authenticated local Wi-Fi WebSocket, reconnect recovery, live event timeline | M2, M5 | Implemented and physically verified |
| Demo reliability | Resettable broken repositories, genuine tests, readiness checks, bounded retries, safe start/stop helpers | M6, M8–M9 | Python passed 5/5 cycles and React passed 3/3; Java is honestly `TOOL_MISSING` without Maven |
| Novel developer usefulness | Move from photographed laptop failure to reviewed and verified local patch without abandoning the phone | M6–M9 | Physical polished hero flow and 42.3-second rehearsal verified |
| Safety and trust | One workspace capability, sensitive-file protection, human approval, non-shell allowlisted runner, hash-safe rollback | M1, M4 | Implemented and regression-tested |
| Feasibility | Runnable Expo, FastAPI, and Vite foundations sharing strict contracts | M0 | Implemented |
| iQOO differentiation | Verified Office Kit adapter only if official access is available; robust WebSocket fallback regardless | M10 | Not implemented; official documentation or SDK access is required first |

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
