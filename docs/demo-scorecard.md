# Milestone 10 demo reliability scorecard

Ratings are based on observed deterministic-provider and real-runner evidence on the release laptop through 2026-09-08. Five means strongest.

| Dimension | Python | React | Java | Evidence |
| --- | ---: | ---: | ---: | --- |
| Setup reliability | 5 | 4 | 5 | Python, React, and Java real failures reproduce; Java preflight reports `READY`. |
| OCR readability | 5 | — | — | Python recovered 4/4 required tokens from a real pytest terminal on physical Android; React/Java await physical capture. |
| Mock analysis reliability | 5 | 5 | 5 | Structured context-backed analysis passed automated generation tests. |
| Patch reliability | 5 | 5 | 4 | The release matrix passed Python 5/5, React 2/2, and Java 2/2 deterministic cycles. The real Java model patch was malformed and safely rejected. |
| Test speed | 5 | 4 | 3 | Complete deterministic cycles measured about 3.5 seconds Python, 16.6 seconds React, and 21.2 seconds Java. |
| Rollback reliability | 5 | 5 | 5 | Exact bytes restored and original failures returned in every executed cycle. |
| Judge clarity | 5 | 5 | 4 | Each has one passing and one intentional failing test with a named file, line, and small guard patch. |

Latest deterministic workflow benchmark medians:

| Stage | Python | React |
| --- | ---: | ---: |
| Reset + failure verification | 949 ms | 3,532 ms |
| Workspace selection + health | 945 ms | 3,526 ms |
| Initial failing validation | 909 ms | 3,488 ms |
| Analysis | 68 ms | 63 ms |
| Patch generation | 43 ms | 40 ms |
| Atomic patch application | 3 ms | 2 ms |
| Passing validation | 744 ms | 3,544 ms |
| Rollback API | 25 ms | 24 ms |
| Full measured workflow, including restored-failure check | 4,664 ms | 17,771 ms |

Real Ollama qualification on Python: **5/5 complete successes** using `qwen3-coder:30b` in the prior qualification, with a fresh two-cycle release rerun recorded in `docs/release-readiness.md`. Every successful cycle produced the correct root-cause concept and file, supported evidence, a parsed and validated patch, real passing pytest, successful rollback, and restoration of the original failing test. No model output was manually edited. React remains the deterministic backup. Java is runner-ready and passed 2/2 deterministic cycles; its real-model attempt diagnosed the issue correctly but the malformed patch was rejected before mutation.

Physical Android regression: registered Python selection, camera open, real terminal OCR, bounded `user_service.py:5` recovery, voice **Fix this**, and voice **Show patch** passed on 2026-09-07. The capture completed in 2,060 ms and recovered `TypeError`, `NoneType`, `user_service.py`, and `get_user_name`.
