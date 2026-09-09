# Contributing to PocketPilot AI

PocketPilot is a security-sensitive developer tool. Contributions should preserve its core boundary: the phone may request a known action, but only the laptop agent may select repository context, validate a proposal, modify a registered workspace, run an allowlisted command, or restore a snapshot.

## Before opening a change

1. Create a focused branch from `main`.
2. Keep public API and persisted-session changes backward compatible unless the pull request documents a migration.
3. Add or update tests for every changed trust boundary and state transition.
4. Never commit real pairing codes, bearer tokens, private paths, `.env` files, model transcripts containing secrets, or user screenshots.

## Local validation

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".\services\agent[dev]"
npm run check
.\.venv\Scripts\python -m ruff check services/agent
.\.venv\Scripts\python -m pytest services/agent
```

For Android changes, also run Expo Doctor and exercise the affected flow in a standalone development or internal-distribution build. Expo Go is not sufficient for native OCR or speech verification.

## Pull-request expectations

- Explain the user-visible change and the trust boundary it touches.
- List validation that was actually run.
- Include screenshots for UI changes, with private information removed.
- Call out known limitations and recovery behavior.
- Keep generated build outputs, APK files, local databases, caches, and secrets out of Git.
