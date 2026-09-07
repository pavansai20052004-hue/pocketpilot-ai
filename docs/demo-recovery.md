# Hackathon demo recovery

Use only real outputs. Never describe a canned fixture as a live run.

| Problem | Fastest legitimate recovery |
| --- | --- |
| Ollama unavailable/model missing | Show the failed Local AI preflight. If judges permit the engineering fallback, switch visibly to `POCKETPILOT_LLM_PROVIDER=mock`, restart the agent, and label it **Deterministic Demo Mode**. |
| Speech recognition poor | Use the visible button for the same state-checked action. Move closer, wait for **SPEAK NOW**, and use a short phrase such as “Fix this.” |
| Camera OCR poor | Retake with larger terminal text and no glare, or correct only the editable OCR transcript before confirming. |
| Phone disconnects | Put both devices on the same Wi-Fi/hotspot, use the laptop’s current LAN address, generate a new pairing code, and pair again. Expired credentials reopen pairing automatically. |
| WebSocket reconnecting | Bring the app foreground, wait for Connected, then use Try Again. HTTP/session state remains authoritative. |
| Demo already fixed | Press registered **RESET**, wait for `DEMO_READY`, then rerun the real failing test. |
| Patch rejected | Generate a new patch from the unchanged source, review it, then approve explicitly. |
| Tests fail unexpectedly | Read the real bounded output, reset the demo, and verify readiness. Switch Python → React if the problem is not immediately recoverable. |
| Maven unavailable | Show Java as `TOOL_MISSING`; switch to React or Python. Do not use the Java text fixture as a live runtime claim. |
| React dependencies missing | Run the documented pre-event `npm ci --ignore-scripts`; during judging switch to Python instead of installing. |

Exact backup switch: close the current voice/camera sheet, choose **React User Profile** (or **Java User Service**) under Hackathon Demos, press Reset, wait for READY, and run the displayed safe test command. No filesystem path is sent by the phone.
