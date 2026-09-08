# PocketPilot hackathon checklist

## Day before

- [ ] Charge phone and laptop.
- [ ] Charge the power bank and pack cables.
- [ ] Verify the development APK launches.
- [ ] Verify laptop–phone pairing on the intended private network.
- [ ] Verify Ollama 0.33.3 or the currently approved version and cache `qwen3-coder:30b` in advance.
- [ ] Run `ollama list`, provider health, and one warm-up request; confirm **LOCAL OLLAMA · qwen3-coder:30b** is visible.
- [ ] Cache Python and React demo dependencies.
- [ ] Run `npm run demo:check`.
- [ ] Run `npm run demo:benchmark` and confirm Python 5/5 and React 3/3.
- [ ] Run `npm run demo:benchmark:ollama` and use real Ollama as primary only at 4/5 or better.
- [ ] Rehearse the Python hero flow twice on the physical phone.
- [ ] Verify the React backup.
- [ ] Confirm Java is shown honestly as `READY` or `TOOL_MISSING`.

## 30 minutes before

- [ ] Prevent avoidable Windows update/restart interruptions manually.
- [ ] Run `npm run demo:start`.
- [ ] Open the desktop Presentation Mode dashboard.
- [ ] Select Python User Service and press **Prepare Demo**.
- [ ] Run the pre-demo check and read every warning.
- [ ] Verify the phone says Connected.
- [ ] Test camera capture and editable OCR.
- [ ] Test one microphone command.
- [ ] Verify the provider label and health.
- [ ] Preload the real model so the live demo does not include a cold 19 GB model load.
- [ ] Close unrelated apps and notifications.
- [ ] Increase terminal font size and use a clean high-contrast layout.

## Immediately before speaking

- [ ] Terminal shows the real `1 failed, 1 passed` Python result.
- [ ] Phone is on Presentation Home and charged.
- [ ] Laptop dashboard shows phone, workspace, provider, and session readiness.
- [ ] React backup is still broken and ready.
- [ ] Know the visible-button fallback for every voice step.

Do not automate firewall changes, operating-system settings, software installation, or model downloads during the presentation.
