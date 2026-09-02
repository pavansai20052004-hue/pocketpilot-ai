import {
  AGENT_EVENT_NAMES,
  DEBUG_STATES,
  type ComponentReadiness,
} from '@pocketpilot/shared-types';

const foundationRows: ReadonlyArray<{
  label: string;
  detail: string;
  status: ComponentReadiness;
}> = [
  { label: 'Agent API', detail: 'FastAPI • :8000', status: 'ready' },
  { label: 'Phone bridge', detail: 'Milestone 5', status: 'not_configured' },
  { label: 'Workspace', detail: 'No repository selected', status: 'not_configured' },
  { label: 'Local AI', detail: 'Provider not configured', status: 'not_configured' },
];

export function App() {
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">P</span>
          <div>
            <strong>PocketPilot</strong>
            <span>Desktop Agent</span>
          </div>
        </div>
        <div className="foundation-badge"><i /> Phase A foundation</div>
      </header>

      <section className="hero-grid">
        <div className="hero-copy">
          <span className="kicker">LOCAL ENGINEERING CONTROL PLANE</span>
          <h1>Ready for a safer<br />debugging workflow.</h1>
          <p>
            The local agent owns repository access, approvals, and verification. The phone stays in control.
          </p>
        </div>
        <div className="readiness-card">
          <div className="card-heading">
            <div>
              <span className="kicker">READINESS</span>
              <h2>Foundation status</h2>
            </div>
            <span className="score">1 / 4</span>
          </div>
          <div className="status-list">
            {foundationRows.map((row) => (
              <div className="status-row" key={row.label}>
                <span className={`status-dot ${row.status === 'ready' ? 'active' : ''}`} />
                <strong>{row.label}</strong>
                <span>{row.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lower-grid">
        <article className="panel contract-panel">
          <span className="kicker">TYPED CONTRACT</span>
          <h2>Workflow vocabulary is shared.</h2>
          <div className="metric-row">
            <Metric value={DEBUG_STATES.length} label="agent states" />
            <Metric value={AGENT_EVENT_NAMES.length} label="event names" />
            <Metric value={3} label="components" />
          </div>
        </article>
        <article className="panel boundary-panel">
          <span className="kicker">SAFETY BOUNDARY</span>
          <h2>No privileged actions yet.</h2>
          <p>Repository reads, patch writes, command execution, model calls, and device transport remain disabled until their guarded milestones.</p>
        </article>
      </section>

      <footer>
        <span>POCKETPILOT / FOUNDATION BUILD 0.1.0</span>
        <span>Local-first · Approval-gated · Observable</span>
      </footer>
    </main>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
