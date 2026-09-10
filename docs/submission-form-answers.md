# iQOO Hackathon Phase 1 form answers

Use these exact answers for the Hyderabad Battle 04 Phase 1 form. Keep the pre-existing-work disclosure intact.

## Idea title

PocketPilot AI — See it. Say it. Fix it.

## Description

Developers often encounter failures away from the IDE—on a terminal, browser, test machine or demo laptop—then lose time copying context across tools and trusting AI suggestions that have never been tested. PocketPilot AI turns an iQOO phone into a secure debugging control surface that closes the loop from visible error to verified repair.

The developer scans an error with the phone camera, reviews on-device OCR and sends only confirmed text to an authenticated laptop agent. A local Qwen3-Coder 30B model analyzes a bounded, security-filtered repository window and proposes a minimal diff. PocketPilot validates paths, evidence, current file hashes, patch shape and risk, then shows the exact change on the phone. Nothing changes until human approval. The laptop applies atomically, runs only the registered test command, reports the real result and offers conflict-safe undo.

Our physical iQOO demo captured a failing Python traceback, found the root cause at user_service.py:5, generated a two-line guard, received phone approval, passed pytest 2/2, explained the change by voice and restored the original safely. Registered Python, Java and React scenarios plus CI exercise the same repair/test/rollback contracts.

The phone is not a resized dashboard: it is the camera, OCR reviewer, microphone, diff viewer, approval key, live status display and rollback control. Source and local inference remain on the paired laptop; AI output never becomes an arbitrary command.

Source: https://github.com/pavansai20052004-hue/pocketpilot-ai

Disclosure: the repository contains pre-event prototype and validation work, which its history preserves. We will follow organiser guidance for what must be rebuilt during the official event window. We claim no unavailable Office Kit API and will use the supplied Office Kit only through its supported cross-device features.

## Prototype URL

https://pocketpilot-ai.sleek-pearl-0098.chatgpt.site

## Source repository

https://github.com/pavansai20052004-hue/pocketpilot-ai

## Video walkthrough URL

https://youtu.be/30oo0FT4uWI

## Deck or document

Upload `submission-artifacts/PocketPilot-AI-Hackathon-Deck.pdf`. The editable PowerPoint source is included beside it.

## Prior builds and hackathons

PocketPilot evolved from earlier repository-aware debugging prototypes into our first complete phone-controlled repair loop. We have shipped installable Android internal builds, open-sourced the monorepo and physically verified camera OCR, authenticated pairing, local Ollama analysis, exact patch approval, real tests and rollback on an iQOO device. The repository preserves pre-event history and clearly separates prior work from event-window work so organisers can assess originality fairly.

## What makes the team stand out

Zero Day 404 spans mobile, backend, local AI and reliability engineering. Most AI debugging demos stop at an explanation or code suggestion; PocketPilot proves an outcome. The model diagnoses and drafts, while deterministic validators enforce evidence, paths, hashes, diff boundaries and risk; a human approves; allowlisted tests decide success; rollback protects later user edits. On physical iQOO hardware we completed camera-to-fix, voice control, pytest 2/2 verification and safe undo. The public repository includes Android, desktop, FastAPI agent, shared contracts, CI, threat-model documentation, pitch deck and a polished walkthrough. We also state limitations plainly: the quality-focused 30B model runs on the paired laptop, and Office Kit is used through supported product features rather than a fictional API.

## Android proficiency

Recommended selection: **Expert / shipped apps** only if the form means shipping installable builds rather than commercial Play Store releases. The team has produced, installed, and physically verified standalone Android internal-distribution APKs with native OCR, speech, secure storage, camera, and local networking. If the form defines “shipped” as a public store release, choose **Intermediate** instead.

## Local LLM proficiency

Recommended selection: **Deployed local LLMs**. PocketPilot uses Ollama with `qwen3-coder:30b` on the paired laptop and has recorded controlled real-model analysis and patch cycles. Do not describe the model as running on the phone.

## Original-work acknowledgement

Check the required acknowledgement only together with the pre-existing-work disclosure above and after confirming the event rules with organisers.
