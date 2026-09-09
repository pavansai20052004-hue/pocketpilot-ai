# iQOO Hackathon Phase 1 form answers

Use these exact answers for the Hyderabad Battle 04 Phase 1 form. Keep the pre-existing-work disclosure intact.

## Idea title

PocketPilot AI — See it. Say it. Fix it.

## Description

PocketPilot AI is a phone-first developer assistant that turns a visible software failure into a repository-aware, human-approved, and test-verified fix. A developer scans a terminal, IDE, browser, or test-machine error with an Android phone, confirms the on-device OCR text, and sends only that reviewed text to an authenticated laptop agent. A local Qwen coding model analyzes bounded repository evidence and proposes a minimal diff. PocketPilot validates the evidence, workspace path, file hashes, patch shape, and risk before showing the exact change on the phone. Nothing is modified until the developer explicitly approves. The laptop then applies the patch atomically, runs only the registered project test command, reports the real result, and supports conflict-safe rollback.

The phone is a genuine control surface: camera, OCR review, microphone, patch review, approval, live status, explanation, and undo. Repository source and model inference remain on the laptop; the repository is not uploaded to a cloud model. At the event, the supplied Office Kit will be used visibly for screen mirroring, remote input, clipboard, and permitted file transfer. PocketPilot does not claim an unavailable Office Kit developer API.

Pre-existing work disclosure: the submitted repository contains a prototype and validation work created before the Hyderabad event, including the mobile workflow, authenticated local bridge, local-model analysis, validated patch flow, tests, and rollback. We will follow organiser guidance on what may be reused, adapted, or rebuilt during the official event window and will clearly identify event-window work.

## Prototype URL

https://pocketpilot-ai.sleek-pearl-0098.chatgpt.site

## Video walkthrough URL

Pending public or unlisted upload of `submission-artifacts/PocketPilot-AI-Demo-Walkthrough.mp4`.

## Deck or document

Upload `submission-artifacts/PocketPilot-AI-Hackathon-Deck.pdf`. The editable PowerPoint source is included beside it.

## Prior builds and hackathons

Our team has explored developer-tool and AI-agent ideas before, including repository-aware debugging and migration-assistance prototypes. PocketPilot AI is the most complete version of that direction: an Android capture and approval surface, authenticated local laptop agent, local Ollama coding model, bounded evidence collection, validated diffs, real project tests, and rollback. The repository history is preserved and the pre-event prototype is explicitly disclosed so organisers can assess originality and event-window work accurately.

## What makes the team stand out

Zero Day 404 combines mobile product thinking with backend, local-AI, and reliability engineering. We did not stop at a screenshot explanation or an AI-generated patch. We built the complete trust loop: on-device OCR, state-checked voice commands, authenticated pairing, bounded repository context, evidence validation, exact diff review, human approval, atomic application, allowlisted tests, and conflict-safe undo. The same Python repair completed on a physical iQOO device, and the repository carries automated evidence across the backend, desktop, mobile, and shared protocol. We are equally disciplined about honest limitations: speech may use the phone’s selected service, the local 30B model prioritizes quality over latency, and Office Kit is used as the supplied cross-device product rather than claimed as an unsupported API integration.

## Android proficiency

Recommended selection: **Expert / shipped apps** only if the form means shipping installable builds rather than commercial Play Store releases. The team has produced, installed, and physically verified standalone Android internal-distribution APKs with native OCR, speech, secure storage, camera, and local networking. If the form defines “shipped” as a public store release, choose **Intermediate** instead.

## Local LLM proficiency

Recommended selection: **Deployed local LLMs**. PocketPilot uses Ollama with `qwen3-coder:30b` on the paired laptop and has recorded controlled real-model analysis and patch cycles. Do not describe the model as running on the phone.

## Original-work acknowledgement

Check the required acknowledgement only together with the pre-existing-work disclosure above and after confirming the event rules with organisers.
