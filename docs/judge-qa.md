# Judge Q&A

**What makes this different from Copilot?** Copilot primarily meets developers in coding tools. PocketPilot starts with physical-world context: capture any visible error from the phone, connect it to bounded local repository evidence, generate a controlled patch, require approval, run real allowlisted tests, and report the result back to the phone. It complements IDE assistants rather than claiming they cannot do related tasks.

**Why phone-first, camera, and voice?** The phone can capture an error from any visible screen and lets a developer review or act while away from the keyboard. Camera and voice complement the normal desktop controls; neither is required.

**Why local AI? Does source leave the laptop?** Ollama can keep analysis on the laptop. Repository files, secrets, patches, tests, and rollback snapshots stay there. Camera images stay on the phone; only confirmed OCR text is sent over the authenticated LAN connection. The selected Android speech service may use internet unless on-device speech is verified.

**Can AI execute arbitrary commands?** No. Model text never becomes shell input. Commands come from immutable templates detected from project manifests and run with no shell, a fixed directory, timeout, and bounded output.

**Can the AI delete files?** No. Provider output is untrusted and has no direct filesystem capability. Path, context, diff, risk, and hash validation plus human approval sit between provider text and a narrowly scoped write.

**Can voice run shell commands?** No. Voice maps only to a closed, state-checked application vocabulary. “Run PowerShell” and other unsupported commands execute nothing.

**What if the file changed?** The patch stores original hashes. A mismatch rejects the stale patch and asks for a fresh one.

**What if rollback would overwrite new work?** Rollback compares the current files with post-patch hashes. A mismatch blocks rollback instead of overwriting newer edits.

**What if it hallucinates or the patch is stale?** Structured output and file references are validated. A patch must apply cleanly to supplied context, pass size/risk rules, and match original hashes immediately before application. The user reviews and approves it; real tests decide success.

**What prevents destructive rollback?** PocketPilot snapshots only touched files and restores them only if their post-patch hashes still match. Newer edits create a conflict instead of being overwritten.

**What happens without internet?** Repository analysis and patch generation use the installed Ollama model through the laptop's loopback API, with no cloud-model integration. In the controlled release proof, the laptop stayed on the phone hotspot while mobile data was disabled: 41 consecutive WAN checks remained unavailable while real `qwen3-coder:30b` analysis, patch generation, pytest, rollback, and restored-failure verification passed in 205.220 seconds. Android speech was not included and may use its selected service's network. Mock mode remains a visibly labeled engineering fallback, never presented as Ollama.

**Does the image leave the phone?** No. Camera and gallery images are OCR'd on-device by default; only editable text the user confirms is sent to the laptop.

**Does repository source leave the laptop?** In configured Ollama mode, source context remains on the laptop. With the deterministic demo provider, the mapping also runs locally and is labeled as a demo provider.

**Does voice require internet?** It may. PocketPilot uses the selected Android speech service, whose network behavior depends on the device. The UI does not claim offline voice unless the phone service verifies it.

**Which languages work? Does this only work for demos?** The shared parser/context/patch pipeline supports Python, Java, JavaScript, and TypeScript patterns. Python, React/TypeScript, and Java all pass real-runner deterministic repair/test/rollback cycles; Java uses Maven/JUnit. Registered demo mappings exist only in the explicitly labeled deterministic provider/reset registry; production Ollama remains generic.

**What is Office Kit’s role?** It is a future optional bridge. No unsupported iQOO Office Kit integration is claimed; authenticated LAN WebSocket/HTTP is the verified path.

PocketPilot’s honest differentiation is phone-first capture, local repository-aware analysis, human-reviewed patches, constrained real testing, voice interaction, local-first privacy, conflict-safe rollback, and one common cross-language workflow.
