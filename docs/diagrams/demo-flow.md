# Primary demo flow

```mermaid
sequenceDiagram
    actor Developer
    participant Phone as iQOO phone
    participant Agent as PocketPilot laptop agent
    participant AI as Local Ollama
    participant Repo as Demo repository

    Developer->>Phone: Scan visible failing terminal
    Phone->>Phone: On-device OCR
    Developer->>Phone: Review confirmed text
    Phone->>Agent: Authenticated analysis request
    Agent->>Repo: Select bounded source context
    Agent->>AI: Error + controlled context
    AI-->>Agent: Structured root-cause proposal
    Agent-->>Phone: Validated diagnosis
    Developer->>Phone: “Fix this”
    Agent->>AI: Validated analysis + bounded files
    AI-->>Agent: Structured diff proposal
    Agent-->>Phone: Validated patch review
    Developer->>Phone: Approve fix
    Agent->>Repo: Atomic patch
    Agent->>Repo: Run allowlisted pytest
    Repo-->>Agent: 2 passed
    Agent-->>Phone: FIX VERIFIED
```

If the real local provider does not meet the measured reliability threshold, the presentation must explicitly switch to the labeled deterministic backup; no silent fallback is allowed.
