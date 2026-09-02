# Architecture decision record: Phase A foundation

## Status

Accepted for foundation scaffolding on 2026-09-02. Feature implementation beyond the foundation requires a Phase A review.

## Decision

PocketPilot AI is a local-first monorepo with three separately runnable processes and one shared contract package:

```text
Android phone (Expo/React Native)
        │ future typed WebSocket/HTTP bridge
        ▼
FastAPI local agent ───── future LLMProvider ───── Ollama
        │
        ├── future constrained repository boundary
        ├── future approval-gated patch engine
        └── future allowlisted test runner
        ▲
        │ typed HTTP/WebSocket observation
Desktop dashboard (Vite/React)
```

The phone is the primary interaction surface. The desktop dashboard is an observability and setup surface, not a competing product UI. The FastAPI process owns workflow state and all privileged local operations. Frontends never access repository files directly.

## Component boundaries

### `apps/mobile`

- Expo-managed React Native with strict TypeScript.
- Android-first, while retaining a web export for fast CI/build verification.
- Will own camera, editable OCR review, constrained voice intents, diff approval, status, and rollback requests.
- Will depend on `DeviceBridge`, not a vendor-specific API.

### `apps/desktop-web`

- Vite React dashboard with strict TypeScript.
- Will display connection/model status, event timeline, files accessed, approved diff, exact allowlisted test command, and output.
- Does not gain direct filesystem or shell privileges.

### `services/agent`

- Python 3.11+ FastAPI application with Pydantic boundary models.
- Sole owner of selected-workspace access, context selection, provider orchestration, patch validation/application, test execution, event persistence, and WebSocket fan-out.
- Modules will be added by capability rather than accumulating logic in route handlers.

### `packages/shared-types`

- Canonical TypeScript contracts consumed by both UI clients.
- Phase A includes system status and stable state/event names only.
- FastAPI Pydantic models define and publish the server boundary through OpenAPI. A later milestone will add a generated TypeScript API client or schema-conformance check before feature contracts expand.

## Workflow ownership

The agent will enforce the state machine:

`IDLE → CAPTURED → ANALYZING → ROOT_CAUSE_FOUND → PATCH_GENERATED → AWAITING_APPROVAL → PATCH_APPLYING → TESTING → SUCCESS | FAILED → ROLLED_BACK`

No frontend can skip transitions. Patch application requires an approval bound to the exact proposal digest. Retry count will be bounded to two or fewer and stored in session state.

## Security decisions

1. **Workspace capability:** the user selects one resolved repository root. All reads and writes must remain beneath it after symlink/path resolution.
2. **Deny by default:** secrets, environment files, VCS metadata, dependencies, build output, binaries, and oversized files are excluded from model context.
3. **No natural-language shell:** test commands come from a versioned allowlist selected by detected build system. Arguments and working directories are validated independently of model output.
4. **Approval-bound mutation:** proposals are immutable unified diffs. The agent validates targets and captures rollback data before presenting them. Only explicit approval applies the matching proposal.
5. **Local-first data:** source and session history remain local. External analytics receive no source code. Ollama is the initial real provider; a deterministic provider supports demo resilience and is always identified as such.
6. **Adapter isolation:** `DeviceBridge` will have Local WebSocket, Mock, and placeholder Office Kit boundaries. No Office Kit implementation will be claimed without official, verified documentation.
7. **Least-information context:** context selection uses error locations, stack frames, project metadata, and bounded dependency exploration instead of sending the entire repository.

## Transport decision

Phase A uses HTTP only for health/status verification. Milestone 2 adds typed session endpoints and WebSocket events. The phone discovers/connects to an explicitly configured LAN endpoint; authentication/pairing and origin policy must be designed before exposing beyond loopback. Vendor transport remains replaceable behind `DeviceBridge`.

## Reliability and demo strategy

- A deterministic demo provider may produce prevalidated proposals, but tests are always executed against real fixture repositories and results are never fabricated.
- Every workflow transition becomes an append-only structured event stored locally.
- The three demo repositories will have resettable known states and pinned dependencies.
- Startup checks report phone, workspace, model, and runtime readiness before a demo begins.
- The WebSocket client will recover current session state after reconnect rather than relying only on transient messages.

## Alternatives considered

### Single Node.js backend

Rejected for the initial agent because Python offers a direct path to local ML/OCR tooling and strong typed API boundaries through FastAPI/Pydantic. TypeScript remains canonical for UI contracts.

### Fully native Android client

Deferred. Expo accelerates a reliable Android-first prototype and supports the current foundation. A development build or native module can be introduced if verified OCR/device APIs require it; the architecture does not depend on Expo Go-only functionality.

### Cloud-hosted model and relay

Rejected as the default because offline reliability, source privacy, and local/open-source AI are judging advantages. Provider and bridge abstractions preserve future options without weakening the local path.

### Direct vendor integration now

Rejected until official iQOO/Vivo Office Kit material is available. The local WebSocket path must stay independently demonstrable.

## Phase A exit criteria

- All three components start.
- Frontend lint, strict type checks, tests, and production builds pass.
- Agent lint and API tests pass.
- Shared contracts are imported by both frontends.
- Documentation distinguishes implemented foundation from planned behavior.

## Milestone 1 implementation

The desktop-agent core now follows a narrow synchronous request path:

`explicit root → SafePathResolver → RepositoryScanner → ProjectDetector → SafeCommandRegistry → explicit POST → SafeProcessRunner`

- `WorkspaceService` owns exactly one selected workspace, its immutable detected command registry, metadata index, and in-memory completed run history.
- `RepositoryScanner` walks metadata only with file-count, per-file-size, and aggregate-size limits. It never follows symlink/reparse directories and never enters ignored dependency, VCS, cache, or build trees.
- `ProjectDetector` reads only bounded known manifests that the scanner classified as non-sensitive. Framework claims include specific manifest evidence.
- `SafeCommandRegistry` creates commands from fixed templates. For package managers, only exact `test`, `build`, `typecheck`, and `lint` scripts qualify. Lifecycle, deployment, and publication scripts are never registered.
- `SafeProcessRunner` looks up a registry ID, revalidates its working directory, resolves the executable, invokes an argv array with `shell=False`, drains capped output, and terminates on timeout.
- The API is synchronous for Milestone 1. The dashboard presents local workspace details and requires a separate user click for every command run.

### Contract mapping

FastAPI Pydantic models in `services/agent/src/pocketpilot_agent/models.py` and TypeScript interfaces in `packages/shared-types/src/index.ts` intentionally use the same JSON field names and enum values. They are manually synchronized in Milestone 1; schema generation is deferred until the API surface is large enough to justify it.

Detailed threat assumptions and residual risks are recorded in [security-model.md](security-model.md).
