# PocketPilot AI — final submission package

Prepared: 2026-09-10

This is the single copy-ready source for the submission. Replace only the contact/team placeholders and add the final GitHub and demo-video links. Do not strengthen the technical claims without new evidence.

## Submission status

| Item | Status | Link or action |
| --- | --- | --- |
| Product title and written answers | READY | Copy from this document |
| Public product tour | READY | https://pocketpilot-ai.sleek-pearl-0098.chatgpt.site |
| Verified standalone Android APK | READY | Build 4: https://expo.dev/accounts/zeroday-404/projects/pocketpilot-ai/builds/3fc84609-d3b0-4fbe-b4e4-71e24c053f7b |
| Latest Android animation build | WAITING | Build 5: https://expo.dev/accounts/zeroday-404/projects/pocketpilot-ai/builds/78f574bd-a52b-48ce-8992-d9f66fdf9e01 |
| Source repository | READY TO PUBLISH | Local repository is audited and ready for the public GitHub URL |
| Narrated demo video | READY TO UPLOAD | `submission-artifacts/PocketPilot-AI-Demo-Walkthrough.mp4` with matching `.srt` captions |
| Pitch deck | READY | PDF and editable PPTX are in `submission-artifacts/` |
| Team/contact fields | USER INPUT | Add name, email, phone, institution, and any teammate details required by the form |

Official event pages: https://iqoo-dev.reskilll.com/ and https://iqoo.reskilll.com/guide

Build 4 is the fallback submission APK because it is finished, installed, and physically exercised. Build 5 becomes the preferred artifact only after it finishes and its new Analyze Error animation passes a quick physical smoke test. EAS internal-distribution artifact links expire, so the final APK should also be attached to a durable release location before submission.

## Primary fields

**Project title:** PocketPilot AI — See it. Say it. Fix it.

**Category:** Developer Tools

**One-line pitch:** Turn a visible software error into a repository-aware, human-approved, and test-verified fix—from an Android phone.

**Short description:**

PocketPilot AI is a phone-first developer assistant that turns a visible software error into a repository-aware, human-approved, and test-verified fix. A developer scans a terminal, IDE, browser, or test-machine failure with an Android phone, reviews the extracted text and proposed diff, approves the change, and sees real tests run on the paired laptop. Local AI, strict validation, allowlisted commands, and conflict-safe rollback keep the workflow controlled.

## Problem statement

Developers lose time and context moving among terminals, IDEs, browsers, AI assistants, source code, and tests. A screenshot explanation can help, but it does not close the repair loop. A suggested fix is not an engineering outcome until it has been grounded in repository evidence, reviewed, safely applied, tested, and reversible.

## Solution

PocketPilot turns an Android phone into a secure control surface for the development environment. The phone captures a visible failure, performs on-device OCR, lets the user confirm the extracted text, and sends only that confirmed text over an authenticated local connection. The laptop selects bounded repository context, asks a local Ollama coding model for a structured diagnosis and minimal patch, validates the response, requires explicit human approval, applies the change atomically, runs only a pre-registered test command, reports the real result, and provides conflict-safe rollback.

## Innovation and phone-first value

PocketPilot does not claim that OCR, speech recognition, or LLMs are individually new. Its innovation is the controlled composition of physical-world input, repository context, local AI, validated repair, human approval, real tests, rollback, and a phone interface. The phone is the camera, OCR review surface, microphone, patch-review screen, approval control, live status display, explanation surface, and rollback control—not a resized desktop dashboard.

## How AI is used

PocketPilot uses Ollama 0.33.3 with Qwen3-Coder 30B on the laptop. The model receives the confirmed failure text and a small, security-filtered repository context through the loopback API. It proposes structured diagnosis and diffs, but cannot directly access the filesystem, choose commands, apply changes, or claim success. Deterministic validators decide whether the evidence and patch are admissible; real tests determine whether the fix is verified.

## Safety and privacy

- Camera OCR runs on the phone; images are not sent to the laptop.
- Only user-confirmed OCR text crosses the authenticated local connection.
- Repository source, model inference, patches, tests, and rollback state stay on the laptop.
- Model output is validated for schema, evidence, paths, hashes, diff structure, scope, and risk.
- A human reviews the exact diff and explicitly approves before any file changes.
- Test commands come from an immutable allowlist; model text never becomes a shell command.
- Rollback refuses to overwrite a file changed after PocketPilot's patch.
- Voice supports only a closed, state-checked command vocabulary.
- Android's selected speech service may use the internet; offline speech is not claimed.

## Verified evidence

- Physical iQOO camera capture and on-device ML Kit OCR.
- Editable OCR confirmation before sending text.
- Authenticated phone-to-laptop connection on a private LAN/hotspot.
- Physical camera-to-real-Ollama Python repair with Qwen3-Coder 30B.
- High-confidence root cause at `user_service.py:5`.
- Human-approved two-line guard patch.
- Real pytest result: 2/2 tests passed.
- TTS explanation and conflict-safe undo.
- Cold-restart recovery after manual re-pair.
- Controlled local-AI workflow with mobile data disabled and 41 consecutive WAN checks unavailable.
- Python real-model reliability: 7/7 controlled successful cycles recorded across qualification and release verification.
- Java deterministic repair/test/rollback: 2/2 with Java 21 and Maven 3.9.16.
- React/TypeScript deterministic repair/test/rollback: 2/2.
- Current automated regression: 130 backend tests passed, 4 environment/opt-in skips, 149 Vitest tests passed, lint and strict types passed, all production builds passed, and Expo Doctor passed 21/21.

## Technology stack

- **Phone:** Expo SDK 57, React Native 0.86, React 19, TypeScript 6, Expo Camera, native ML Kit OCR, Expo Speech Recognition, Expo Speech, SecureStore, File System, and Image Manipulator.
- **Desktop:** React 19, TypeScript 6, Vite 8, and shared typed API contracts.
- **Laptop agent:** Python, FastAPI, Pydantic, Uvicorn, HTTPX, SQLite, authenticated HTTP, and authenticated WebSockets.
- **Local AI:** Ollama 0.33.3 with `qwen3-coder:30b`; an explicitly labeled deterministic provider is retained only as a recovery/demo backup.
- **Quality:** Pytest, Ruff, Vitest, ESLint, strict TypeScript, Expo Doctor, production builds, registered demo fixtures, and repeatability benchmarks.

## Honest Office Kit statement

Official vivo/iQOO material confirms Office Kit as a consumer cross-device feature, but no verified public developer API or hackathon SDK was found. PocketPilot does not claim to use Office Kit.

For the hackathon, this does **not** mean Office Kit should be ignored. The official event guide says the loaner iQOO device arrives with Office Kit paired and that its screen-mirroring, clipboard, file-transfer, and remote-control usage is measured separately by HackTracker. During the event, use Office Kit visibly to mirror/control the phone and transfer approved demo material. That is real Office Kit product usage, while PocketPilot's own authenticated LAN bridge remains the app's data transport.

Use this forward-looking sentence if the form asks about future iQOO integration:

> PocketPilot's bridge architecture is designed so verified iQOO cross-device APIs can replace or complement its authenticated LAN transport when developer access is available.

## Official judging alignment

| Official dimension | Weight | PocketPilot evidence and event action |
| --- | ---: | --- |
| End product quality | 30% | Complete scan-to-verified-fix workflow, polished phone UI, safe recovery, and rollback |
| Novelty and impact | 20% | Physical error capture connected to repository evidence, controlled local AI, and real tests |
| Creative phone use | 15% | Camera, on-device OCR, voice, diff review, approval, live status, TTS, and undo on the iQOO phone |
| Technical depth | 15% | React Native, authenticated LAN bridge, FastAPI state machine, local Ollama, strict validation, atomic patching, allowlisted tests, and SQLite events |
| Office Kit usage | 10% | At the event, use the supplied Office Kit for screen mirroring, remote input, clipboard, and approved file transfer; HackTracker records counts and durations |
| Demo and presentation | 10% | 3–5 minute live phone demo plus the prepared 2 minute 35 second narrated walkthrough |

The official guide requires the product to run and be pitched on the iQOO phone. PocketPilot satisfies that product shape; the laptop remains the local repository/AI execution side while the phone is the capture, review, approval, and result surface.

## Event-rule check before submitting

The official guide says code must be original and written during the event window, and that teams submit their repository and demo assets on Reskilll before the cutoff. Before using this repository at a city battle, confirm with the organisers whether a pre-event prototype is permitted as a reference or must be rebuilt during the event. Do not describe pre-event work as event-window work. Keep the commit history and submit exactly what the organisers allow.

## Current limitations

- The 30B local model prioritizes quality but can take roughly one to three minutes across analysis and patch generation on this laptop.
- Evidence is concentrated on registered Python, Java, and React demo repositories rather than broad external-user trials.
- A cold laptop/session restart currently requires manual phone re-pairing.
- Android voice depends on the phone's selected recognition service and may use the network.
- Office Kit is not integrated because no verified developer interface was available.
- The execution product is local by design; the public website is a presentation-only product tour.

## 60-second spoken pitch

“Developers often see failures outside the IDE—on a terminal, test machine, browser, or another laptop. PocketPilot turns an Android phone into a secure debugging control surface. I scan the visible error, confirm on-device OCR text, and send only that text to an authenticated laptop agent. A local Qwen coding model combines it with bounded repository evidence and proposes a minimal fix. The AI cannot touch files or run commands. PocketPilot validates the evidence and diff, shows the exact change on the phone, and waits for human approval. It then applies the patch atomically, runs only the registered test command, and shows Fix Verified only when the real tests pass. The physical iQOO workflow completed camera capture, local-model diagnosis, voice control, approval, pytest 2/2, explanation, and safe rollback without Metro. PocketPilot closes the loop from visible failure to verified outcome: See it. Say it. Fix it.”

## Final submission order

1. Publish the cleaned repository and add the public GitHub URL here.
2. Wait for Build 5; install it and smoke-test scan, analysis animation, voice, approval, verified fix, and undo. If it fails or is delayed, submit verified Build 4.
3. Run `npm run pocketpilot:start`, reset the Python demo, and keep Qwen3-Coder warm.
4. Upload the reviewed narrated demo as unlisted and add its link here.
5. Upload the reviewed PDF deck from `submission-artifacts/`.
6. Open the deck, video, prototype, and repository links once in a private browser before submission.
7. At the venue, use the supplied Office Kit visibly for screen mirroring, remote input, clipboard, and permitted file transfer so HackTracker captures genuine usage.
8. Paste the submission answers, add team/contact fields, and perform a final claim and event-window compliance check.
9. Submit only after opening every public link in a private/incognito browser.

## Final link block

- Public product tour: https://pocketpilot-ai.sleek-pearl-0098.chatgpt.site
- Source repository: PENDING
- Demo video: PENDING
- Verified APK build page: https://expo.dev/accounts/zeroday-404/projects/pocketpilot-ai/builds/3fc84609-d3b0-4fbe-b4e4-71e24c053f7b
- Latest APK build page: https://expo.dev/accounts/zeroday-404/projects/pocketpilot-ai/builds/78f574bd-a52b-48ce-8992-d9f66fdf9e01

## Claims not to use

- “PocketPilot integrates with Office Kit.”
- “The complete app is fully offline.”
- “The AI autonomously writes code or executes arbitrary commands.”
- “The system is production-ready for every repository.”
- Any unmeasured time-saving, accuracy, adoption, or user-scale percentage.
