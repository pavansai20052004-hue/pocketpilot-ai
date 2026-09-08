# Milestone 10 submission readiness

Assessment date: 2026-09-08. Scores use only repository tests, recorded physical-device evidence, official-source research, and completed benchmarks. A score of 10 is intentionally reserved for broad production and external-user evidence that this prototype does not yet have.

## Scorecard

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Product | 8.5/10 | The end-to-end phone flow covers capture, editable OCR, diagnosis, patch review, approval, actual tests, explanation, history, and rollback. External-user validation and general-repository coverage remain limited. |
| Demo | 8.5/10 | The Python hero path completed physically on an iQOO phone in 42.3 seconds with the explicitly labeled deterministic provider. Registered reset, preflight, React backup, and recovery instructions reduce event risk. Real Ollama passed 5/5 controlled end-to-end cycles, but a new physical-phone Ollama rehearsal did not complete during this final run and remains a pre-submission action. |
| Technical depth | 9/10 | Expo/React Native, native-backed OCR and speech, authenticated HTTP/WebSocket transport, FastAPI state machine, SQLite events, bounded repository retrieval, local-model providers, strict diff validation, safe execution, and rollback form a genuine multi-layer system. |
| Phone usage | 9/10 | A physical iQOO phone is the camera, OCR, voice, review, approval, live status, explanation, and rollback surface. The workflow is not a desktop UI merely resized for mobile. |
| AI credibility | 8.5/10 | Official Ollama 0.33.3 and the 19 GB `qwen3-coder:30b` model are installed locally. The real provider produced correct evidence-backed analysis, valid patches, real passing pytest, safe rollback, and restored failures in 5/5 consecutive cycles with no manual output edits. Evidence is still concentrated on one fixture, inference is slow, and external-network isolation was not physically verified. |
| Safety | 9/10 | Model output cannot directly access files or processes. Evidence, paths, hashes, diff structure, scope, and risk are validated before explicit approval; tests are allowlisted and rollback is conflict-safe. Focused stale-patch, double-approval, traversal, secret, rollback-conflict, and dangerous-voice checks pass. |
| Privacy | 8.5/10 | Camera OCR stays on the phone and only confirmed text crosses the authenticated LAN. Repository context and the local model stay on the laptop. Android speech may use the selected phone speech service, so fully offline speech is not claimed. |
| Presentation | 8.5/10 | Presentation Mode, provider-transparent labels, polished success/undo screens, an 85-second video plan, a 10-slide outline, multiple pitch lengths, diagrams, and judge Q&A are prepared. Final footage and deck production remain manual submission tasks. |
| Reliability | 9/10 | The final regression passes 128 backend tests with 5 honest skips and 147 Vitest tests, plus Expo Doctor 21/21, lint, strict types, both production builds, Python 5/5 deterministic cycles, React 3/3 deterministic cycles, and real Ollama 5/5. Java remains honestly skipped because Maven is absent. |
| Hackathon fit | 8/10 | The phone-first developer-tool story, local-first AI, safety, and physical iQOO validation fit the track well. Official vivo/iQOO sources confirm Office Kit as a product feature, but no verified developer API was found, so PocketPilot correctly avoids an unsupported integration claim. |

## Real local AI evidence

- Runtime: Ollama 0.33.3 installed from the official Windows package.
- Model: `qwen3-coder:30b`, Q4_K_M, approximately 19 GB, 30.5B total and 3.3B active parameters.
- Configuration: loopback API, 8,192-token context, 2,048-token output cap, temperature 0, 15-minute keep-alive, 300-second request ceiling.
- Five-cycle Python result: **5/5 complete successes** with correct root-cause concept and file, supported evidence, parsed and validated patch, real pytest pass, safe rollback, and original failure restoration in every cycle.
- Analysis provider latency: **44.659–48.347 seconds; median 46.406 seconds; mean 46.492 seconds**.
- Patch generation latency: **63.669–156.773 seconds; median 67.174 seconds; mean 100.836 seconds**. The longer cycles used the single bounded repair pass.
- Complete workflow latency: **114.532–207.510 seconds; median 117.756 seconds; mean 151.612 seconds**, including setup, real repair, real tests, rollback, and restored-failure verification.
- Offline isolation test: **NOT PHYSICALLY VERIFIED**. A temporary Ollama-only outbound firewall rule was attempted, but Windows denied the operation without administrator rights; no rule remained. Runtime traffic is verified to use the loopback Ollama API, but this is not presented as an external-network isolation test.
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
4. Venue LAN/firewall conditions can interrupt phone-to-laptop transport even though reconnect recovery is implemented.
5. Office Kit has no verified public developer interface, limiting the vendor-specific integration story to physical iQOO use and future adapter readiness.

## Must fix before submission

- Capture final product footage with the `LOCAL OLLAMA · qwen3-coder:30b` label, OCR privacy message, exact diff, and real passing test result visible.
- Rehearse the selected primary provider twice after a cold app restart and one phone reconnect.
- Run preflight immediately before recording or presenting and verify the Python fixture is intentionally failing.
- Review the final form and deck for unsupported Office Kit, offline speech, benchmark, or production-readiness claims.

## Nice to have before onsite

- Prepare a charged power bank, spare cable, and private Wi-Fi/hotspot fallback.
- Cache all dependencies and keep the real model warm before the live demo.
- Retain a short separate rollback clip and a React backup clip.
- Increase terminal font size and hide unrelated notifications, paths, pairing codes, and personal information.
- Print a one-page recovery order: retry, reconnect, reset Python, deterministic provider, React backup, recorded video.
