# PocketPilot installation and release startup

This guide describes the supported Windows laptop plus Android phone release setup. The production demo does not require Expo Go, Metro, a cloud AI API, or repository upload.

## Laptop prerequisites

- Windows 11
- Node.js 24+ and npm 11+
- Python 3.11+
- Java 21
- Apache Maven 3.9.16
- Official Ollama for Windows 0.33.3 or newer
- Local `qwen3-coder:30b` model

The release candidate used Apache Maven 3.9.16 installed under the current user's tools directory. Its downloaded archive was checked against Apache's published SHA-512 value before extraction. `JAVA_HOME`, `MAVEN_HOME`, and the user `Path` were updated without machine-wide changes.

## Repository setup

From the repository root:

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".\services\agent[dev]"
Copy-Item .env.example .env
```

Configure `.env` for the local provider:

```text
POCKETPILOT_LLM_PROVIDER=ollama
POCKETPILOT_OLLAMA_MODEL=qwen3-coder:30b
```

Leave `POCKETPILOT_ADVERTISED_HOST` empty for normal use. The release launcher selects one active private-LAN IPv4 address and passes it to the agent so the phone receives the same reachable address shown on the laptop. Set it explicitly only when the laptop has multiple active network adapters and automatic selection chooses the wrong trusted network.

If the repository is stored inside OneDrive, right-click the PocketPilot folder and select **Always keep on this device** before the event. The final release rehearsal exposed Files On-Demand placeholders during network isolation; the workspace was pinned locally before the successful offline proof. Confirm that the model, Python environment, Maven dependencies, Node dependencies, and registered demo fixtures are all available before disconnecting external connectivity.

## One-command release startup

```powershell
npm run pocketpilot:start
```

The launcher:

1. checks Node, npm, Java, Maven, Python, official Ollama, provider configuration, and the installed model;
2. refuses partial port conflicts;
3. starts Ollama only when it is not already running;
4. starts the FastAPI agent on the private LAN and the production desktop build on loopback;
5. checks the real provider and model health;
6. prints the dashboard URL, phone agent address, and a fresh five-minute pairing code;
7. records only processes it started.

It never downloads a model, installs a dependency, changes the firewall, or kills a conflicting program.

Safe shutdown:

```powershell
npm run pocketpilot:stop
```

Shutdown validates the recorded PID, start time, and command signature before stopping a process. A pre-existing Ollama service and unrelated Node/Python processes are preserved.

## Standalone Android build

The `presentation` EAS profile creates an internally distributed APK with the JavaScript bundle and native modules included:

```powershell
cd apps\mobile
npx eas-cli build --platform android --profile presentation
```

Install the resulting APK on the iQOO phone. Do not start Metro. Put phone and laptop on the same trusted private Wi-Fi or hotspot, run the one-command laptop startup, then pair with the printed address and code.

Release build 2: `https://expo.dev/artifacts/eas/I-2_eYoybP3qSMHcQ9bDllWy3_eqehd19m8TtTp88SQ.apk`. EAS build ID: `c9e3bde3-be24-44bf-a206-a1d37f3f6d38`. APK SHA-256: `3C997DA99EB80D7F98AC0DA25717B1BAACD59C8C7B28E80A15328D9A1B51BD49`.

The release app identifier is `ai.pocketpilot.mobile`, version `1.0.0`, Android version code `2`. Camera and microphone permissions are required for the vision and voice features. Voice audio is handled by Android's selected speech service and may use the internet; PocketPilot stores only the transcript.

## Verification commands

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
.\.venv\Scripts\python -m ruff check services\agent
.\.venv\Scripts\python -m pytest services\agent
.\.venv\Scripts\python scripts\benchmark_demo.py
```

For a final presentation check, run `npm run demo:check` after startup and prepare the selected registered demo from the dashboard.

The controlled offline verifier is intended only for pre-event evidence after every dependency is downloaded:

```powershell
.\scripts\verify-offline-ollama.ps1
```

It waits for external connectivity to disappear, verifies the local model, runs one disposable real-Ollama Python repair/test/rollback cycle, monitors WAN availability throughout, and writes ignored runtime evidence to `.pocketpilot\offline-proof.json`. It does not test or claim offline Android speech.

## Public presentation site

The product tour is public at https://pocketpilot-ai.sleek-pearl-0098.chatgpt.site. It is deliberately separate from the working product and contains no local endpoint, pairing code, device session, repository path, source file, patch, model prompt, test output, or private runtime data.
