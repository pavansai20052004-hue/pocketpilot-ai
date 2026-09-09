# Release Candidate readiness evidence

Assessment date: 2026-09-09. `PASS` means the stated executable or outside-in check succeeded. `PARTIAL` means useful evidence exists but the complete language/provider combination did not pass. Physical and offline claims below come only from recorded hardware and network-isolation evidence.

## Current gate status

| Release gate | Status | Evidence |
| --- | --- | --- |
| Official Java toolchain | PASS | Java 21 and Apache Maven 3.9.16 run on Windows; the Maven archive matched Apache's published SHA-512 value. |
| One-command laptop startup | PASS | Prerequisite preflight, production dashboard, LAN agent, real Ollama provider/model health, and fresh pairing-code generation succeeded. |
| Safe shutdown | PASS | Two recorded PocketPilot processes stopped; pre-existing Ollama and an unrelated live Node process remained running. |
| Advertised phone address | PASS | The pairing response used the selected private-LAN address instead of a stale hostname. |
| Deterministic Python reliability | PASS | 5/5 full failure, analysis, patch, approval, real pytest pass, rollback, and restored-failure cycles. |
| Deterministic Java reliability | PASS | 2/2 full cycles using real Maven/JUnit execution. |
| Deterministic React reliability | PASS | 2/2 full cycles using real Vitest execution. |
| Real local AI, Python | PASS | Earlier qualification produced 5/5 complete `qwen3-coder:30b` cycles, followed by a fresh 2/2 release-candidate rerun after the source changes. All seven cycles generated a validated patch, passed real pytest, rolled back safely, and restored the original failure. |
| Real local AI, Java | PARTIAL | The model correctly diagnosed `src/main/java/demo/UserService.java:12` with valid repository evidence. Patch output stayed malformed after one bounded repair and was rejected with HTTP 422; no file changed. |
| Public presentation site | PASS | Production build, responsive desktop/mobile inspection, interaction check, public deployment, and outside-in load succeeded. |
| Standalone APK | PASS | EAS presentation build `c9e3bde3-be24-44bf-a206-a1d37f3f6d38` finished successfully for version 1.0.0 / Android build 2 from checkpoint `2f88e43`. The signed APK is 137,089,554 bytes with SHA-256 `3C997DA99EB80D7F98AC0DA25717B1BAACD59C8C7B28E80A15328D9A1B51BD49`; it installed and launched on the physical iQOO with Metro stopped. |
| Physical standalone iQOO hero cycle | PASS | A fresh camera session used real `qwen3-coder:30b`, found `user_service.py:5`, generated the validated guard, required explicit phone approval, passed real pytest 2/2, and rolled back to the exact broken file. System processing was about 184.1 seconds; recorded session wall time was 743.4 seconds including human review pauses. |
| Cold-restart text cycle | PASS WITH MANUAL REPAIRING | Laptop services and the model were stopped and restarted. Automatic phone recovery did not restore the expired connection, but fresh pairing succeeded; real text analysis, patch generation, approval, and pytest 2/2 then passed. |
| Controlled offline local-AI proof | PASS | With the phone hotspot retained and mobile data disabled, 41/41 WAN probes remained unavailable for the complete run. Local `qwen3-coder:30b` completed correct analysis, validated patch generation, real pytest, rollback, and restored-failure verification in 205.220 seconds. Android speech was excluded and is not claimed offline. |

## Automated regression snapshot

- JavaScript lint: PASS, including the presentation-site application source.
- Strict TypeScript: PASS for desktop, mobile, and shared contracts.
- Backend test suite: 130 PASS, 4 documented opt-in/host-capability skips, including the live Maven/JUnit scenario.
- Desktop Vitest: 3/3 PASS.
- Mobile Vitest: 138/138 PASS.
- Shared-contract Vitest: 6/6 PASS.
- Desktop production build: PASS.
- Mobile web export compatibility check: PASS.
- Presentation-site production build: PASS.
- Production dependency audit: no high or critical advisory remains after compatible site-toolchain upgrades. Expo's existing transitive moderate advisories remain tracked; the offered automatic remediation is a breaking SDK downgrade and is not accepted.

## Deterministic timing snapshot

The final matrix used disposable demo copies and restored the original failing state after every cycle.

- Python total workflow: 3.50-3.60 seconds per cycle.
- Java total workflow: 21.19-21.30 seconds per cycle, including Maven failure, passing validation, and restored failure.
- React total workflow: 16.57-16.69 seconds per cycle.

The fresh real-Ollama Python rerun completed 2/2 cycles in 245.239 and 228.363 seconds. Analysis requests took 78.409 and 57.298 seconds; patch requests took 162.956 and 167.301 seconds; real pytest took 860 and 714 milliseconds. Both runs used `qwen3-coder:30b`, required no manual output edits, and restored the failing fixture after rollback.

The physical camera hero session recorded 65.140 seconds for analysis, 118.284 seconds for patch generation, 2 milliseconds for apply, and 675 milliseconds for real pytest. The system work was approximately 184.1 seconds. The full 743.4-second session clock also contains deliberate user review/approval pauses and is reported separately rather than presented as inference latency.

After a laptop/model cold restart and manual re-pair, the physical text-input session recorded 48.343 seconds for analysis, 160.362 seconds for patch generation, 3 milliseconds for apply, and 1.115 seconds for real pytest. The corresponding real processing total was approximately 209.8 seconds.

The controlled offline run recorded 70.591 seconds of analysis-provider time, 130.724 seconds of patch-provider time, 719 milliseconds of real pytest, and 205.220 seconds for the full failure/analysis/patch/test/rollback/restored-failure workflow. All 41 network observations and the final completion check reported WAN unavailable; external connectivity was restored only after the evidence file reported `PASS`.

These figures measure the complete automated harness, not only model inference and not the physical phone experience.

## Public/local trust boundary

Only the product explanation is hosted publicly. The Android client connects directly to the authenticated local agent. Repository scanning, bounded context, Ollama requests, diff validation, patch snapshots, tests, session history, device tokens, and rollback remain on the laptop. Phone photos stay on the phone; confirmed OCR text crosses the private paired connection.

## Closed release sequence

1. The signed APK installed and launched with Metro stopped.
2. Fresh camera input, real Ollama analysis/patch, approval, real tests, undo, and restored failure passed on the physical iQOO.
3. The laptop/model cold-restart recovery passed after a required fresh manual pairing; automatic reconnect remains a documented limitation.
4. Controlled external-network isolation passed without claiming offline Android speech.
5. Final regression, artifact/secret audit, and the required unpushed release commit are recorded in the final handoff.
