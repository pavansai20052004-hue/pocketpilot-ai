# Phase-1 submission answers

Release-candidate note (2026-09-09): the public product tour is live at `https://pocketpilot-ai.sleek-pearl-0098.chatgpt.site`; the standalone Android APK launched on a physical iQOO without Metro; the camera-to-real-Ollama hero, cold-restart text repair after manual re-pair, real pytest, undo, and controlled WAN-isolated local-AI workflow all passed. Java 21 with verified Maven 3.9.16 passes 2/2 deterministic repair/test/rollback cycles. Exact evidence and limitations are recorded in `docs/release-readiness.md`.

Ready-to-paste copy for the iQOO Hackathon submission form. Replace only form-specific team/contact fields; do not strengthen technical claims without new evidence.

## Idea title

**PocketPilot AI — See it. Say it. Fix it.**

Category: **Developer Tools**

## Short description — 68 words

PocketPilot AI is a phone-first developer assistant that turns a visible software error into a repository-aware, human-approved, and test-verified fix. A developer scans a terminal, IDE, browser, or test-machine failure with an Android phone, reviews the extracted text and proposed diff, approves the change, and sees real tests run on the paired laptop. Local AI, strict validation, allowlisted commands, and conflict-safe rollback keep the workflow controlled.

## Medium description — approximately 150 words

Developers repeatedly move debugging context among a terminal, IDE, browser, AI assistant, source files, and test runner. A screenshot explanation can help, but it does not close the repair loop. PocketPilot AI turns an Android phone into a focused control surface for the development environment. The phone captures a visible failure, performs on-device OCR, lets the user confirm the text, and sends it through an authenticated local connection. The laptop parses the error, selects bounded evidence from the active repository, and asks a local Ollama coding model for structured diagnosis and a minimal patch. AI output is always untrusted: PocketPilot validates its schema, evidence, paths, original file hashes, diff applicability, scope, and risk before showing it. Only explicit human approval can apply the patch, after which PocketPilot runs a pre-registered test command and reports the actual result. The verified prototype supports rollback without overwriting later developer edits.

## Long description — approximately 320 words

Debugging is still a fragmented workflow. A developer sees an error in a terminal, browser console, test machine, projector, or second laptop; copies it into search or an AI assistant; explains missing repository context; transfers suggested code into an editor; and then returns to the terminal to verify it. Even an accurate screenshot explanation leaves most of the engineering loop manual.

PocketPilot AI is a phone-first developer assistant that connects that physical-world failure to a controlled workstation agent. The developer can scan an error with the Android camera, paste confirmed text, or invoke a supported action by voice. ML Kit OCR runs on the phone, and the user reviews the extracted text before only that text crosses an authenticated local HTTP/WebSocket bridge. Repository source, session history, patches, tests, and rollback snapshots remain on the laptop.

The laptop parses the failure and selects a small, security-filtered source window from the explicitly chosen repository. A preinstalled local Ollama coding model returns structured root-cause and patch proposals. The model is never treated as an authority and has no direct filesystem or process access. PocketPilot validates cited evidence against the supplied context, rejects unsafe paths and malformed or excessive diffs, checks the original file hash, and exposes the exact change for human approval. After approval, it applies the patch atomically and runs only an immutable, pre-registered validation command. “Fix Verified” appears only when the real command passes. Rollback is available, but it refuses to overwrite any file changed after PocketPilot's patch.

The working prototype has been exercised on a physical iQOO phone through camera, OCR, voice, approval, real pytest, TTS, reconnect, and rollback. Python is the primary demo; React/TypeScript is the verified backup. PocketPilot does not claim OCR or LLMs alone are novel. Its innovation is combining physical-world input, repository evidence, local AI, constrained repair, human control, real verification, and a mobile interface into one complete debugging loop.

## Problem

Developers lose time and context moving repeatedly among the terminal, IDE, browser, AI assistant, source code, and tests. Error screenshots and copied tracebacks omit the repository evidence needed for a dependable diagnosis. A suggested fix is not an engineering outcome until it has been reviewed, safely applied, tested, and—if needed—reversed.

## Solution

PocketPilot connects phone camera, confirmed text, and closed voice commands to a repository-aware laptop agent. It parses the failure, selects bounded source context, validates a local model's diagnosis and diff, requires explicit human approval, applies the patch atomically, runs the repository's allowlisted test command, reports the real result, and provides hash-safe rollback.

## Why phone-first?

A software error is not always on the developer's current IDE screen. It can appear on another laptop, a remote/test machine display, a terminal, a projector, an IDE, or a browser console. A phone is a portable camera, microphone, secure review screen, and approval surface that can begin the workflow without first moving the failure into one particular editor.

## Innovation

PocketPilot does not claim that camera OCR, speech recognition, or large language models are individually novel. The innovation is their controlled composition:

`physical-world input + repository context + safe agentic repair + human approval + real tests + rollback + phone interface`

The result is a complete verified workflow rather than an isolated explanation or unexecuted code suggestion.

## AI usage

PocketPilot uses **Ollama 0.33.3** on the laptop with **Qwen3-Coder 30B (`qwen3-coder:30b`, 30.5B total parameters, 3.3B active parameters, Q4_K_M, approximately 19 GB)**. Error text and bounded repository context are sent only to the loopback Ollama API. The model proposes structured diagnosis and diffs; separate deterministic parsers and validators decide what is admissible. The final reliability and latency evidence is recorded in `docs/submission-readiness.md` and must be quoted exactly in the form or pitch.

## Privacy

- Camera OCR runs on the phone; images are not uploaded to the laptop.
- Only user-confirmed OCR text and its input provenance cross the paired local connection.
- Repository context, source, diffs, test output, and rollback state remain on the laptop.
- With local Ollama active, analysis and patch generation use the laptop's loopback API and do not use a cloud model. A controlled phone-hotspot run kept 41 consecutive WAN checks unavailable while real analysis, patch generation, tests, rollback, and failure restoration passed. This does not include or claim offline Android speech.
- Voice audio is handled by the selected Android speech service and is not stored by PocketPilot. That service may use the internet, so offline speech is not claimed.

## Safety

- The AI has no direct filesystem or command-runner interface.
- Structured output and unified diffs must pass schema validation.
- Evidence must resolve to context actually supplied to the model.
- Absolute, traversal, secret, generated, create/delete/rename, binary, malformed, excessive, and high-risk patches are rejected.
- Original-content SHA-256 checks block stale patches.
- A human reviews and approves the exact diff before any write.
- Tests come from an immutable allowlist; model text never becomes a command.
- Application is atomic and the actual test result is stored.
- Rollback verifies the patched hash and refuses to overwrite subsequent developer edits.
- Voice resolves only a closed set of state-checked intents and cannot execute shell text.

## Exact technology stack

- **Phone:** React Native 0.86, React 19, Expo SDK 57, TypeScript 6, Expo Camera, `rn-mlkit-ocr` with bundled Latin ML Kit model, Expo Speech Recognition, Expo Speech, Expo SecureStore, Expo File System, and Expo Image Manipulator.
- **Desktop:** React 19, TypeScript 6, Vite 8, and shared typed API contracts.
- **Local agent:** Python 3.11+, FastAPI, Pydantic Settings, Uvicorn, HTTPX, SQLite persistence, authenticated HTTP, and WebSockets.
- **Local AI:** Ollama 0.33.3 with Qwen3-Coder 30B when the real provider is selected; a separately labeled deterministic provider is retained only as an engineering/demo backup.
- **Quality:** Pytest, Ruff, Vitest, ESLint, strict TypeScript, Expo Doctor, production builds, registered Python/React fixtures, and a five-cycle real-model benchmark.

## Qualitative impact

PocketPilot can reduce manual copy/paste and context reconstruction, shorten the path from a visible failure to a tested result, and make AI-assisted repair safer through evidence checks and explicit control. Its phone-first input is useful across environments without requiring the developer to begin inside one editor. No time-saving percentage or user-scale claim is made because those outcomes have not yet been measured with external users.

## Future roadmap

- Broader real-world evaluation across additional repositories, languages, and frameworks.
- A verified iQOO/vivo cross-device adapter if an official developer SDK and access path become available.
- More reliable fully offline speech options while keeping voice actions constrained.
- Additional local model profiles selected by hardware and measured reliability.
- Team review workflows and auditable approval policies.

These are roadmap items, not current functionality.

## What makes you and your team stand out?

I am a solo builder who owns the entire PocketPilot loop: product framing, Expo/React Native phone experience, TypeScript contracts, FastAPI agent, local-model integration, repository analysis, patch validation, security boundaries, test execution, and physical Android verification. The project is a working prototype rather than slideware. I deliberately treated AI output as untrusted, measured repeatability, tested failure and rollback paths, and kept unsupported integrations out of the claim set. That combination of full-stack execution, AI engineering, mobile interaction, and reliability discipline is what I bring to the hackathon.

## Android proficiency

I built and physically verified an Expo/React Native Android development app with camera and gallery permissions, bundled on-device ML Kit OCR, image preprocessing, push-to-talk Android speech recognition, TTS, secure token storage, lifecycle recovery, and an authenticated local network bridge. I am comfortable integrating and validating native-backed Expo modules and Android configuration. I do not claim senior native-Kotlin expertise; this prototype's Android layer is React Native/Expo with native modules.

## LLM proficiency

I designed provider abstractions for deterministic testing and local Ollama, bounded repository context selection, injection-resistant prompt boundaries, schema-constrained analysis, structured patch generation, one bounded repair attempt for malformed JSON, and independent evidence/diff validation. I integrated and evaluated a real Qwen3-Coder model locally. The architecture assumes that LLM output can be wrong or hostile: no model response can directly write a file, select a command, claim verification, or bypass human approval.

## Prior builds

My relevant build history includes **DevPilot AI**, **ROCMporter Agent**, and now **PocketPilot AI**. The supplied project history identifies DevPilot AI and ROCMporter Agent as earlier relevant AI/developer-tool work; I would present their actual demos or repositories rather than invent feature or adoption claims here. PocketPilot is the strongest end-to-end evidence: it combines mobile capture, local AI, a repository-aware safety pipeline, real tests, physical-device validation, and repeatability work in one functioning prototype.

## Office Kit wording

Official vivo/iQOO sources confirm Office Kit as a consumer cross-device feature, but no verified public developer API or hackathon SDK was found. PocketPilot does not claim to use Office Kit. Safe submission wording:

> PocketPilot's bridge architecture is designed so verified iQOO cross-device APIs can replace or complement its authenticated LAN transport when developer access is available.
