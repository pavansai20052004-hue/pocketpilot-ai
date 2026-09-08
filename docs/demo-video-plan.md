# 60–90 second demo video plan

Target length: 85 seconds. Record actual product footage from the physical iQOO and laptop. Use simple cuts, readable captions, and the real test output. Do not fabricate screens, model timings, or Office Kit behavior.

## Storyboard

### 0–5 seconds — Promise

- Visual: PocketPilot Presentation Mode on the iQOO beside the laptop terminal.
- Caption: **PocketPilot AI — See it. Say it. Fix it.**
- Narration: “PocketPilot turns a visible software failure into a reviewed and test-verified fix.”

### 5–15 seconds — Real failure

- Visual: laptop runs the registered Python test and shows `1 failed, 1 passed` plus `user_service.py:5`.
- Keep the terminal large enough for the failed test name and exception to be readable.
- Narration: “The bug is real: a missing user causes a TypeError in the repository.”

### 15–25 seconds — Phone capture

- Visual: tap **Scan Error**, photograph the terminal, then show on-device OCR review.
- Caption: **Image stays on phone · confirmed text goes to laptop**.
- Narration: “I scan the terminal with the phone. OCR runs on-device, and I confirm the text before it crosses the local bridge.”

### 25–35 seconds — Repository-aware diagnosis

- Visual: root-cause screen with provider/model label, `user_service.py · line 5`, evidence, and repair strategy.
- Narration: “The laptop combines the traceback with bounded repository context, and the local model identifies the dereference site.”

### 35–45 seconds — Voice control

- Visual: open voice sheet, wait for `SPEAK NOW`, say **“Fix this”**, and show `GENERATE PATCH`.
- Caption: **Closed command vocabulary**.
- Narration: “Voice invokes only a supported, state-checked action. It cannot run shell commands.”

### 45–55 seconds — Review and approval

- Visual: readable two-line diff, validation summary, actual test command, and **Approve Fix**.
- Narration: “The AI proposes a diff, but validators and a human decision stand between model output and the repository.”

### 55–70 seconds — Actual verification

- Visual: tap approval, show live progress, then `FIX VERIFIED`, `2 / 2 tests passed`, provider name, and changed-file count.
- Capture the audible TTS if room audio is usable; otherwise show the success state without claiming it in narration.
- Narration: “PocketPilot applies the patch atomically and runs the pre-registered pytest command. Two tests pass.”

### 70–80 seconds — Explainability

- Visual: tap **What changed?**, briefly show the explanation and **View diff**.
- Narration: “The result remains explainable, and a conflict-safe rollback is available.”

### 80–90 seconds — Close

- Visual: product title and phone/laptop pair.
- Caption: **Error → context → approval → tests → verified fix**.
- Narration: “PocketPilot: a phone-first, local-first, controlled debugging workflow. See it. Say it. Fix it.”

## Capture checklist

- Reset the Python demo immediately before recording.
- Confirm the dashboard and phone show the same real provider/model.
- Preload the Ollama model before the take.
- Keep phone and laptop on the same stable LAN.
- Enable Do Not Disturb and hide personal notifications.
- Avoid exposing pairing codes, bearer tokens, home-directory details, device identifiers, or unrelated personal files.
- Frame only the demo repository and product UI.
- Record the terminal failure and successful tests in the same take when practical.
- Run rollback after the main take, outside the 85-second edit, and retain a separate verification clip if judges request evidence.

## Backup recording path

If the real local model is not presentation-ready at recording time, visibly switch to **Deterministic Demo Provider** and say it is the engineering fallback. Never retain Ollama narration or labels over deterministic footage. The verified React scenario is the secondary technical backup.
