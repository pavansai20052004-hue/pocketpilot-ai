# Local agent API

All routes are versioned under `/api/v1`. The documented development server binds to loopback. Pydantic rejects undeclared request fields.

## Debug sessions

Create a session:

```http
POST /api/v1/sessions
Content-Type: application/json

{"title":"NullPointerException in checkout"}
```

The response contains the `IDLE` session at revision `0` and `session_started` event at sequence `1`.

Request a legal transition using the exact revision most recently observed:

```http
POST /api/v1/sessions/{session_id}/transitions
Content-Type: application/json

{
  "target_state":"CAPTURED",
  "expected_revision":0,
  "summary":"Terminal error text captured."
}
```

Illegal state changes, stale revisions, and exhausted retries return `409` without modifying history. Missing sessions return `404`; structurally invalid requests return `422`.

Fetch events after an exclusive sequence cursor:

```http
GET /api/v1/sessions/{session_id}/events?after_sequence=4
```

## WebSocket recovery

Connect to:

```text
ws://127.0.0.1:8000/api/v1/sessions/{session_id}/events/ws?after_sequence=4
```

The first message is always a snapshot:

```json
{
  "type": "snapshot",
  "session": {"id": "...", "state": "ANALYZING", "revision": 2},
  "events": []
}
```

Later messages contain one persisted event:

```json
{"type":"event","event":{"sequence":3,"name":"root_cause_found"}}
```

Clients should persist the greatest processed sequence and reconnect with it. The snapshot remains authoritative for current state.

## Transition graph

```text
IDLE → CAPTURED → ANALYZING → ROOT_CAUSE_FOUND → PATCH_GENERATED
  → AWAITING_APPROVAL → PATCH_APPLYING → TESTING → SUCCESS

CAPTURED..TESTING → FAILED
FAILED → ANALYZING (maximum two retries)
FAILED | SUCCESS → ROLLED_BACK
```

Milestone 3 analysis invokes these transitions through the session service. Patch states remain inactive.

## Local analysis

Check the configured provider without downloading anything:

```http
GET /api/v1/analysis/provider
```

Submit TEXT input only after the session reaches `CAPTURED`:

```http
POST /api/v1/sessions/{session_id}/analyze
Content-Type: application/json

{
  "input_type":"TEXT",
  "raw_text":"java.lang.NullPointerException ...",
  "file_hint":"UserService.java",
  "language_hint":"Java",
  "framework_hint":null,
  "expected_revision":1
}
```

The synchronous response contains the final `ROOT_CAUSE_FOUND` session and persisted analysis. WebSocket subscribers receive `analysis_requested`, parsing/context/provider/validation progress, and `root_cause_found`. Progress summaries contain paths and line ranges, never source bodies.

Fetch the durable result with `GET /api/v1/sessions/{session_id}/analysis`. Typed provider failures use `PROVIDER_UNAVAILABLE`, `MODEL_NOT_FOUND`, `TIMEOUT`, or `INVALID_RESPONSE`, transition an active analysis to `FAILED`, and return an appropriate 503, 504, or 422 response. Stale or simultaneous requests return 409.

## Patch lifecycle

Generate only from `ROOT_CAUSE_FOUND` using the current revision:

```http
POST /api/v1/sessions/{session_id}/patches/generate
{"expected_revision":3}
```

A successful response reaches `AWAITING_APPROVAL` and contains the complete unified diff and validation/risk result. Files are unchanged. Fetch the durable public view with `GET /api/v1/sessions/{session_id}/patches/current`.

Approve or reject the exact proposal:

```http
POST /api/v1/sessions/{session_id}/patches/{patch_id}/approve
{"expected_revision":5}
```

```http
POST /api/v1/sessions/{session_id}/patches/{patch_id}/reject
{"expected_revision":5}
```

Approval synchronously revalidates base hashes, applies atomically, chooses an existing safe command, and returns `SUCCESS` or `FAILED`. Rejection transitions to `FAILED` without writes. Wrong patch IDs, revisions, concurrent operations, stale files, and rollback conflicts return 409. Invalid provider output/diffs return 422; provider availability errors return 503/504.

Rollback a completed attempt with `POST /api/v1/sessions/{session_id}/patches/{patch_id}/rollback` and the current revision. Rollback succeeds only when every current file hash equals the stored patched hash.
