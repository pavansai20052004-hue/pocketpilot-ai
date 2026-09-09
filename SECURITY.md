# Security policy

PocketPilot AI is a competition prototype that can apply reviewed code changes inside explicitly registered local workspaces. Please treat security reports as private until a fix is available.

## Reporting a vulnerability

Use GitHub's private vulnerability-reporting feature when it is available for this repository. Include the affected commit, reproduction steps, expected impact, and whether the issue can cross a workspace, authentication, approval, command, or rollback boundary.

Do not include real credentials, device tokens, private repository contents, or personal screenshots in a public issue.

## In-scope boundaries

- Pairing-code and device-token authentication
- Authenticated HTTP and WebSocket sessions
- Workspace path confinement and sensitive-file exclusion
- Model-output schema and evidence validation
- Patch parsing, file-hash checks, atomic replacement, and rollback conflicts
- Allowlisted command execution and output limits
- Android OCR, speech, local storage, and approval-state behavior

## Current status

PocketPilot is not represented as a general-purpose production security boundary. It is designed for controlled hackathon demonstrations and registered local projects. Users should review the exact diff, keep source under version control, and run it only on a trusted private network.
