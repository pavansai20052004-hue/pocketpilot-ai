# Security boundary

```mermaid
flowchart TD
    Model[Local model output] --> Untrusted[UNTRUSTED]
    Untrusted --> Schema[Strict schema validation]
    Schema --> Evidence[Evidence + supplied-context validation]
    Evidence --> Path[File and path validation]
    Path --> Hash[Original-content hash validation]
    Hash --> Risk[Scope and risk rules]
    Risk --> Human{Human approval}
    Human -->|Reject| Stop[No repository change]
    Human -->|Approve| Atomic[Atomic patch application]
    Atomic --> Test[Pre-registered allowlisted test]
    Test --> Result[Actual result recorded]
    Result --> Rollback[Conflict-safe rollback available]
```

The model has no filesystem or process-runner interface. Repository text, OCR text, and model output are all treated as untrusted data. Only the application can cross the approval boundary.
