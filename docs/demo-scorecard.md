# Milestone 10 demo reliability scorecard

Ratings are based on observed deterministic mock-provider runs on the development laptop on 2026-09-07. Five means strongest. Java AI/patch structure is tested, but runtime-dependent ratings remain unscored because Maven is absent.

| Dimension | Python | React | Java | Evidence |
| --- | ---: | ---: | ---: | --- |
| Setup reliability | 5 | 4 | — | Python and React real failures reproduce; Java reports `TOOL_MISSING`. |
| OCR readability | 5 | — | — | Python recovered 4/4 required tokens from a real pytest terminal on physical Android; React/Java await physical capture. |
| Mock analysis reliability | 5 | 5 | 5 | Structured context-backed analysis passed automated generation tests. |
| Patch reliability | 5 | 5 | 4 | Python 3/3 and React 2/2 full cycles; Java one-file patch generated but could not run Maven. |
| Test speed | 5 | 4 | — | Validation measured 660 ms Python and 1,655 ms React in the recorded benchmark. |
| Rollback reliability | 5 | 5 | — | Exact bytes restored and original failures returned in every executed cycle. |
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

Real Ollama qualification on Python: **5/5 complete successes** using `qwen3-coder:30b`. Every cycle produced the correct root-cause concept and file, supported evidence, a parsed and validated patch, real passing pytest, successful rollback, and restoration of the original failing test. No model output was manually edited. Median provider analysis was 46.406 seconds, median patch generation was 67.174 seconds, and median complete workflow including rollback/restored-failure verification was 117.756 seconds. React remains the deterministic backup; Java remains `TOOL_MISSING` because Maven is absent.

Physical Android regression: registered Python selection, camera open, real terminal OCR, bounded `user_service.py:5` recovery, voice **Fix this**, and voice **Show patch** passed on 2026-09-07. The capture completed in 2,060 ms and recovered `TypeError`, `NoneType`, `user_service.py`, and `get_user_name`.
