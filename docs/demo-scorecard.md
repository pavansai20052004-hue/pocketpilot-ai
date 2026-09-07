# Milestone 8 demo reliability scorecard

Ratings are based on observed deterministic mock-provider runs on the development laptop on 2026-09-07. Five means strongest. Java AI/patch structure is tested, but runtime-dependent ratings remain unscored because Maven is absent.

| Dimension | Python | React | Java | Evidence |
| --- | ---: | ---: | ---: | --- |
| Setup reliability | 5 | 4 | — | Python and React real failures reproduce; Java reports `TOOL_MISSING`. |
| OCR readability | 5 | — | — | Milestone 8 Python recovered 4/4 required tokens from a real pytest terminal on physical Android; React/Java await physical capture. |
| Mock analysis reliability | 5 | 5 | 5 | Structured context-backed analysis passed automated generation tests. |
| Patch reliability | 5 | 5 | 4 | Python 3/3 and React 2/2 full cycles; Java one-file patch generated but could not run Maven. |
| Test speed | 5 | 4 | — | Validation measured 660 ms Python and 1,655 ms React in the recorded benchmark. |
| Rollback reliability | 5 | 5 | — | Exact bytes restored and original failures returned in every executed cycle. |
| Judge clarity | 5 | 5 | 4 | Each has one passing and one intentional failing test with a named file, line, and small guard patch. |

Recorded mock workflow benchmark:

| Stage | Python | React |
| --- | ---: | ---: |
| Reset + failure verification | 740 ms | 1,611 ms |
| Workspace selection + health | 764 ms | 1,640 ms |
| Initial failing validation | 719 ms | 1,583 ms |
| Analysis | 58 ms | 55 ms |
| Patch generation | 39 ms | 38 ms |
| Atomic patch application | 3 ms | 2 ms |
| Passing validation | 660 ms | 1,655 ms |
| Rollback API | 22 ms | 23 ms |
| Full measured workflow, including restored-failure check | 3,850 ms | 8,274 ms |

Real Ollama: skipped for all three because Ollama is not installed. No model was downloaded.

Physical Android regression: registered Python selection, camera open, real terminal OCR, bounded `user_service.py:5` recovery, voice **Fix this**, and voice **Show patch** passed on 2026-09-07. The capture completed in 2,060 ms and recovered `TypeError`, `NoneType`, `user_service.py`, and `get_user_name`.
