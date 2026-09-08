# Judge pitch and Q&A

## 15-second pitch

PocketPilot AI turns a visible software error into a repository-aware, human-approved, and test-verified fix. The phone captures and controls the workflow; the laptop keeps source, local AI, patch validation, tests, and rollback behind strict safety boundaries.

## 30-second pitch

Developers lose time moving failures among terminals, browsers, IDEs, and AI chats. PocketPilot starts where the error is visible: scan it with the phone, confirm the text, let the laptop select bounded repository context, review the local model's validated patch, and approve real tests. It does not give an AI unrestricted shell access. The outcome is not only an explanation—it is a controlled, verified repair with safe rollback.

## 60-second pitch

PocketPilot AI is a phone-first developer assistant for failures that appear outside one IDE: on another laptop, a test machine, a terminal, a browser console, or a projector. The phone performs on-device OCR and sends only confirmed text through an authenticated local bridge. The laptop parses the error, selects bounded evidence from the chosen repository, and asks a local Ollama coding model for structured analysis and a minimal patch. Every model response is untrusted. Schema, evidence, path, hash, and risk checks run before a human can approve anything. PocketPilot then applies the patch atomically, runs only a pre-registered test command, reports the actual result, and offers conflict-safe rollback. General AI can explain a screenshot; PocketPilot closes the engineering loop from physical error to verified outcome.

## Three-minute demo narration

“This terminal shows the real starting state: one Python test fails and one passes. The failure points to `user_service.py` because a repository lookup can return no user.

I open PocketPilot on this iQOO phone and tap Scan Error. The photo is processed on the phone using ML Kit OCR. I can review and correct the extracted text; the image itself is not uploaded to the laptop.

When I analyze it, the paired laptop parses the traceback and selects a small, bounded source window from the active repository. The provider label is visible here. In the real-local-AI configuration, PocketPilot sends this controlled context to the preinstalled Ollama model on the same laptop. The model returns a structured diagnosis, not a command. PocketPilot validates the cited file, line, symbol, and evidence before displaying them.

Now I say ‘Fix this.’ Voice is a closed intent system—it can request supported actions but cannot run PowerShell or arbitrary shell text. The model proposes this two-line guard. That proposal is still untrusted: PocketPilot validates the JSON schema, unified diff, path, original file hash, patch scope, and risky patterns.

Nothing changes until I approve the exact diff. After approval, PocketPilot applies it atomically and runs the repository's pre-registered pytest command. The result is real: two tests pass, one file changed, and the phone reports FIX VERIFIED. If I choose Undo Fix, PocketPilot checks that the patched file has not changed before restoring it; a developer edit would cause a rollback conflict instead of being overwritten.

This is the distinction: a general assistant can analyze the screenshot, and an IDE agent is excellent inside the editor. PocketPilot begins from a physical error and turns the phone into a controlled interface to the actual development environment.

Office Kit is a real vivo/iQOO product feature, but we found no verified public developer API, so this build truthfully uses its own authenticated LAN bridge. The architecture can adopt an official cross-device API when developer access becomes available.

PocketPilot doesn't replace ChatGPT. It turns AI debugging into a complete, controlled, phone-first engineering workflow. See it. Say it. Fix it.”

## Critical judge question

### Why not just use ChatGPT?

ChatGPT and other general assistants can analyze a screenshot. PocketPilot's value is closing the loop against the real repository: error, context, fix, approval, tests, verification, and rollback. **PocketPilot doesn't replace ChatGPT. It turns AI debugging into a complete, controlled, phone-first engineering workflow.**

## Additional judge Q&A

### Why a phone?

Failures are often visible outside the active IDE—on a second computer, a test device, a terminal, a browser, or a projector. The phone is already available as a camera, microphone, review screen, and approval surface.

### Why local AI?

Repository context can remain on the laptop, internet dependency is reduced after the model is installed, and the provider is inspectable and replaceable. Local does not mean trusted: its output still passes the same validators.

### Why not Copilot or another IDE agent?

IDE agents are powerful inside their editor workflow. PocketPilot explores a complementary phone-first path that can begin from a physical error outside the editor and retain a narrowly controlled workstation boundary.

### What if the AI hallucinates?

The model response is a proposal. Analysis citations must resolve to supplied repository context. Patch JSON and unified diffs must parse; paths, hashes, applicability, scope, and risk rules must pass. Unsupported claims are removed or downgraded, and invalid patches never reach approval.

### Can the AI run arbitrary commands?

No. The AI has no process-runner interface, and no model-generated string becomes a command. Tests are selected from an immutable allowlist created when the repository is inspected.

### Can it delete files?

No. The current patch validator rejects create, delete, rename, binary, absolute-path, traversal, generated-file, secret, and excessive-scope patches.

### Does the image leave the phone?

The camera image and OCR processing stay on the phone. The user reviews the extracted text, and only that confirmed text is sent to the paired laptop.

### Does the repository leave the laptop?

With the configured local Ollama provider, repository context stays on the laptop. PocketPilot contains no cloud LLM provider or source-upload path.

### Does it require internet?

The preinstalled Ollama model performs repository analysis and patch generation through the laptop's loopback API with no cloud-model integration. External-network isolation was not physically verified because Windows denied the temporary firewall rule without administrator rights. The phone and laptop still need their local connection, and Android speech recognition may depend on the selected phone speech service and network, so fully offline operation is not claimed.

### Why require human approval?

Even a valid patch changes developer-owned source. Approval makes the exact change and validation command visible before the mutation boundary is crossed.

### What happens if tests fail?

PocketPilot reports the actual failed validation and does not label the fix verified. The stored pre-patch content supports rollback when the current file hash is safe.

### What if the file changes after the proposal?

Approval rechecks the original-content hash. A stale proposal is rejected instead of overwriting newer work.

### How is rollback safe?

Rollback verifies that the current bytes still match the exact patched hash. If another edit occurred, PocketPilot reports a rollback conflict and leaves the file untouched.

### What languages work?

The parser, repository context, and patch-validation architecture covers Python, Java, JavaScript, and TypeScript patterns. Python is the primary fully exercised flow; React/TypeScript is the verified backup.

### Is Java fully verified?

No. The Java fixture, parsing, analysis, and patch structure exist, and JDK 21 is installed, but Maven is absent on this laptop, so the real Java test loop remains `TOOL_MISSING`.

### Is Office Kit integrated?

No. Official sources confirm Office Kit as a vivo/iQOO product feature, but no verified public developer API or hackathon SDK was found. PocketPilot uses its own authenticated LAN transport and keeps an explicit unimplemented adapter boundary for future verified access.
