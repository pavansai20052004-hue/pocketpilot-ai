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

These transitions model control flow only. Milestone 2 does not perform analysis, generate/apply patches, or run tests as a side effect of session advancement.
