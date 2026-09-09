# Milestone 10 submission readiness

Assessment date: 2026-09-09. Scores use only repository tests, recorded physical-device evidence, official-source research, and completed benchmarks. A score of 10 is intentionally reserved for broad production and external-user evidence that this prototype does not yet have.

## Scorecard

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Product | 8.5/10 | The end-to-end phone flow covers capture, editable OCR, diagnosis, patch review, approval, actual tests, explanation, history, and rollback. External-user validation and general-repository coverage remain limited. |
| Demo | 9/10 | The standalone physical iQOO completed the camera-to-real-Ollama hero, explicit approval, real pytest, and rollback with Metro stopped. Registered reset, preflight, React backup, and recovery instructions reduce event risk; the remaining gap is high 30B CPU latency and manual re-pair after a cold restart. |
| Technical depth | 9/10 | Expo/React Native, native-backed OCR and speech, authenticated HTTP/WebSocket transport, FastAPI state machine, SQLite events, bounded repository retrieval, local-model providers, strict diff validation, safe execution, and rollback form a genuine multi-layer system. |
| Phone usage | 9/10 | A physical iQOO phone is the camera, OCR, voice, review, approval, live status, explanation, and rollback surface. The workflow is not a desktop UI merely resized for mobile. |
| AI credibility | 9/10 | Official Ollama 0.33.3 and the 19 GB `qwen3-coder:30b` model are installed locally. Seven controlled Python cycles, the physical iQOO hero, the cold-restart text cycle, and the isolated-WAN run produced correct repository evidence, validated patches, real pytest, and safe rollback. Evidence remains concentrated on one primary Python fixture and CPU inference is slow. |
| Safety | 9/10 | Model output cannot directly access files or processes. Evidence, paths, hashes, diff structure, scope, and risk are validated before explicit approval; tests are allowlisted and rollback is conflict-safe. Focused stale-patch, double-approval, traversal, secret, rollback-conflict, and dangerous-voice checks pass. |
| Privacy | 9/10 | Camera OCR stays on the phone and only confirmed text crosses the authenticated LAN. Repository context and the local model stay on the laptop, including during a full workflow with 41 consecutive unavailable WAN checks. Android speech may use the selected phone speech service, so offline speech is not claimed. |
| Presentation | 8.5/10 | Presentation Mode, provider-transparent labels, polished success/undo screens, an 85-second video plan, a 10-slide outline, multiple pitch lengths, diagrams, and judge Q&A are prepared. Final footage and deck production remain manual submission tasks. |
| Reliability | 9/10 | The final toolchain-complete regression passes 130 backend tests with 4 honest skips and 147 Vitest tests, lint, strict types, production builds, Python 5/5, Java 2/2 with real Maven/JUnit, and React 2/2 deterministic cycles. Real Ollama passed 7/7 controlled Python cycles plus physical, cold-restart, and isolated-WAN verification. Automatic cold-app re-pair remains unresolved. |
| Hackathon fit | 8/10 | The phone-first developer-tool story, local-first AI, safety, and physical iQOO validation fit the track well. Official vivo/iQOO sources confirm Office Kit as a product feature, but no verified developer API was found, so PocketPilot correctly avoids an unsupported integration claim. |

**Final release-readiness score: 88/100.** The score is the sum of the ten category scores above. Every deduction is tied to a documented limitation rather than an unverified claim.

## Real local AI evidence

- Runtime: Ollama 0.33.3 installed from the official Windows package.
- Model: `qwen3-coder:30b`, Q4_K_M, approximately 19 GB, 30.5B total and 3.3B active parameters.
- Configuration: loopback API, 8,192-token context, 2,048-token output cap, temperature 0, 15-minute keep-alive, 300-second request ceiling.
- Five-cycle Python result: **5/5 complete successes** with correct root-cause concept and file, supported evidence, parsed and validated patch, real pytest pass, safe rollback, and original failure restoration in every cycle.
- Analysis provider latency: **44.659–48.347 seconds; median 46.406 seconds; mean 46.492 seconds**.
- Patch generation latency: **63.669–156.773 seconds; median 67.174 seconds; mean 100.836 seconds**. The longer cycles used the single bounded repair pass.
- Complete workflow latency: **114.532–207.510 seconds; median 117.756 seconds; mean 151.612 seconds**, including setup, real repair, real tests, rollback, and restored-failure verification.
- Physical real-model result: the standalone iQOO camera hero used `qwen3-coder:30b`, reached high-confidence `user_service.py:5`, generated and applied the two-line guard, and passed real pytest 2/2. Processing was approximately 184.1 seconds; actual session wall time was 743.4 seconds including human pauses.
- Offline isolation test: **PASS**. The laptop stayed connected to the phone hotspot while mobile data was disabled. The verifier recorded 41/41 WAN checks unavailable through completion; local analysis took 70.591 seconds, patch generation 130.724 seconds, real pytest 719 milliseconds, and the complete analysis/patch/test/rollback/restored-failure workflow 205.220 seconds.
- Presentation classification: **REAL LOCAL AI — PRIMARY** by the defined 4/5 threshold; the deterministic provider remains the explicit low-latency backup.

## Top 5 strengths

1. A complete physical-error-to-tested-fix workflow instead of screenshot explanation alone.
2. Meaningful smartphone use through on-device OCR, closed voice actions, review, approval, live status, and rollback.
3. Strong trust boundary: local-model text is untrusted and cannot directly write files or run commands.
4. Real verification and reversible mutation with stale-patch and rollback-conflict protection.
5. Honest presentation resilience through registered Python/React scenarios and an explicitly labeled deterministic backup.

## Top 5 risks

1. A 19 GB local model may have high cold-load and inference latency on CPU/shared-memory hardware.
2. AI evidence is concentrated on one five-cycle Python fixture rather than a diverse external repository set.
3. Android speech recognition may depend on the handset's configured speech service and network quality.
4. The cold-restart rehearsal required a fresh manual pairing; automatic reconnect did not restore the expired device session.
5. Office Kit has no verified public developer interface, limiting the vendor-specific integration story to physical iQOO use and future adapter readiness.

## Must fix before submission

- Capture final product footage with the `LOCAL OLLAMA · qwen3-coder:30b` label, OCR privacy message, exact diff, and real passing test result visible.
- Run preflight immediately before recording or presenting and verify the Python fixture is intentionally failing.
- Review the final form and deck for unsupported Office Kit, offline speech, benchmark, or production-readiness claims.

## Nice to have before onsite

- Prepare a charged power bank, spare cable, and private Wi-Fi/hotspot fallback.
- Cache all dependencies and keep the real model warm before the live demo.
- Retain a short separate rollback clip and a React backup clip.
- Increase terminal font size and hide unrelated notifications, paths, pairing codes, and personal information.
- Print a one-page recovery order: retry, reconnect, reset Python, deterministic provider, React backup, recorded video.
