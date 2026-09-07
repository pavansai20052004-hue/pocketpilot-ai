# PocketPilot hackathon demo suite

These three independent projects are intentionally committed in a broken state. Each has one passing test, one failing test, a minimal one-file repair, metadata in `demo.json`, and a canonical broken source under `demo/fixtures`.

| Demo ID | Project | Real validation | Expected start |
| --- | --- | --- | --- |
| `python-null-user` | `python-broken-app` | `pytest -q` | `TypeError`, 1 failed / 1 passed |
| `java-null-user` | `java-broken-app` | `mvn test` | `NullPointerException`, 1 error / 1 passed |
| `react-null-profile` | `react-broken-app` | `npm test` | `TypeError`, 1 failed / 1 passed |

From the repository root:

```powershell
npm run demo:check
npm run demo:start
npm run demo:reset
```

Reset accepts no path and restores only the source files registered in `DemoService`. It returns `DEMO_READY` only after the expected real failure reappears. Java honestly reports `TOOL_MISSING` when Maven is absent. Tests repair temporary copies; the committed projects remain broken.

For the three-minute pitch use Python. React is the first backup and Java is the second. Switch by pressing **SELECT** on the desktop or enabling Demo Mode on the phone and selecting a registered scenario.

Observed timings and limitations are recorded in the [reliability scorecard](../docs/demo-scorecard.md).
