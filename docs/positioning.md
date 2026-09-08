# PocketPilot AI positioning

## One sentence

**PocketPilot AI is a phone-first developer assistant that turns a visible software error into a repository-aware, human-approved, and test-verified fix.**

## The problem

Debugging is fragmented across a terminal, IDE, browser, AI assistant, and test runner. A developer repeatedly copies errors, explains repository context, transfers suggestions back into code, and manually verifies the result. Screenshot explanation helps, but it does not close that loop.

## What PocketPilot does

PocketPilot connects physical-world input to a controlled workstation repair pipeline:

`camera / confirmed text / closed voice intent → repository context → validated root cause → constrained patch → human approval → atomic apply → allowlisted tests → verified result → conflict-safe rollback`

The phone is the capture, review, and approval surface. The laptop retains the repository, local model, validators, patch engine, test runner, and rollback state.

## Why this is not “screenshot understanding is novel”

General AI assistants can inspect an error screenshot and explain likely causes. PocketPilot does not claim that OCR, speech recognition, or an LLM is individually novel. Its differentiation is the complete engineering loop after recognition: selecting bounded evidence from the actual repository, treating AI output as untrusted, asking a human to approve a real diff, executing only a pre-registered validation command, reporting the real outcome, and preserving a safe rollback path.

## Why not just use ChatGPT?

ChatGPT and other general assistants can analyze the screenshot. PocketPilot's value is closing the loop against the real repository: error, context, fix, approval, tests, verification, and rollback.

**PocketPilot doesn't replace ChatGPT. It turns AI debugging into a complete, controlled, phone-first engineering workflow.**

## Relationship to IDE coding agents

IDE agents are powerful when the developer is already inside a supported editor. PocketPilot explores a different interaction model: the failure may be visible on another laptop, a test machine, a projector, a terminal, or a browser console. A phone can capture that physical context immediately and become a narrow control surface for a repository-aware laptop agent. This is complementary positioning, not a claim that IDE agents lack repair or verification capabilities.

## Primary users

- A developer testing software on a second machine or device.
- An engineer facing a terminal or build failure away from the active IDE window.
- A developer who wants to review and approve a constrained repair from the phone.
- A support or development engineer looking at an error in another environment.
- A student or solo builder moving frequently between phone, browser, terminal, and editor.

## Value proposition

- Less manual context switching and copy/paste.
- Repository evidence rather than screenshot-only guessing.
- A verified outcome rather than an unexecuted suggestion.
- Phone-based capture, review, approval, and status.
- Local-first privacy for repository analysis and patch generation when the installed Ollama provider is active.
- Controlled execution through validation, human approval, allowlisted commands, and rollback.

## Truthful boundaries

- Camera OCR runs on the Android phone; the user reviews text before sending it.
- Repository context and source remain on the laptop.
- Android speech recognition may use the selected phone speech service and network.
- The deterministic provider is an explicitly labeled backup, not a local model.
- Office Kit is a verified vivo/iQOO product feature, but no verified developer API is currently available; PocketPilot does not claim an Office Kit integration.
