import { useEffect, useState } from 'react';

import type { AgentEvent, AnalysisExecutionResponse, AnalysisRecord, CommandRun, DebugSession, PatchActionResponse, PatchGenerationResponse, PatchWorkflowView, ProviderHealth, SafeCommand, SessionTransitionResult, WorkspaceInfo } from '@pocketpilot/shared-types';

const apiBaseUrl = import.meta.env.VITE_AGENT_HTTP_URL ?? 'http://127.0.0.1:8000';

export function App() {
  const [workspacePath, setWorkspacePath] = useState('');
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [commandRun, setCommandRun] = useState<CommandRun | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorText, setErrorText] = useState('');
  const [fileHint, setFileHint] = useState('');
  const [languageHint, setLanguageHint] = useState('');
  const [frameworkHint, setFrameworkHint] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [analysisEvents, setAnalysisEvents] = useState<ReadonlyArray<AgentEvent>>([]);
  const [provider, setProvider] = useState<ProviderHealth | null>(null);
  const [debugSession, setDebugSession] = useState<DebugSession | null>(null);
  const [patchWorkflow, setPatchWorkflow] = useState<PatchWorkflowView | null>(null);

  useEffect(() => {
    void request<ProviderHealth>('/api/v1/analysis/provider').then(setProvider).catch(() => setProvider(null));
  }, []);

  async function inspectWorkspace() {
    if (!workspacePath.trim()) {
      setError('Enter an explicit local project directory.');
      return;
    }
    setBusyAction('inspect');
    setError(null);
    setCommandRun(null);
    try {
      const result = await request<WorkspaceInfo>('/api/v1/workspaces/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root_path: workspacePath.trim() }),
      });
      setWorkspace(result);
    } catch (requestError) {
      setWorkspace(null);
      setError(messageFrom(requestError));
    } finally {
      setBusyAction(null);
    }
  }

  async function runCommand(command: SafeCommand) {
    setBusyAction(command.id);
    setError(null);
    setCommandRun(null);
    try {
      const result = await request<CommandRun>(
        `/api/v1/commands/${encodeURIComponent(command.id)}/run`,
        { method: 'POST' },
      );
      setCommandRun(result);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusyAction(null);
    }
  }

  async function analyzeError() {
    if (workspace === null || !errorText.trim()) {
      setError('Select a workspace and paste an error before starting analysis.');
      return;
    }
    setBusyAction('analyze'); setError(null); setAnalysis(null); setPatchWorkflow(null); setAnalysisEvents([]);
    let socket: WebSocket | null = null;
    try {
      const created = await request<SessionTransitionResult>('/api/v1/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Analysis: ${workspace.name}` }),
      });
      const captured = await request<SessionTransitionResult>(`/api/v1/sessions/${created.session.id}/transitions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_state: 'CAPTURED', expected_revision: created.session.revision, summary: 'Pasted error captured for local analysis.' }),
      });
      socket = new WebSocket(eventSocketUrl(created.session.id, captured.event.sequence));
      socket.onmessage = (message) => {
        const payload: unknown = JSON.parse(String(message.data));
        if (isEventMessage(payload)) setAnalysisEvents((events) => [...events, payload.event]);
        else if (isSnapshotMessage(payload)) setAnalysisEvents(payload.events);
      };
      const completed = await request<AnalysisExecutionResponse>(`/api/v1/sessions/${created.session.id}/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_type: 'TEXT', raw_text: errorText.trim(), file_hint: fileHint.trim() || null, language_hint: languageHint.trim() || null, framework_hint: frameworkHint.trim() || null, expected_revision: captured.session.revision }),
      });
      setAnalysis(completed.analysis);
      setDebugSession(completed.session);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      socket?.close(); setBusyAction(null);
    }
  }

  async function generateFix() {
    if (debugSession === null) return;
    setBusyAction('generate-patch'); setError(null);
    try {
      const generated = await request<PatchGenerationResponse>(`/api/v1/sessions/${debugSession.id}/patches/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_revision: debugSession.revision }),
      });
      setDebugSession(generated.session); setPatchWorkflow(generated.workflow);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusyAction(null); }
  }

  async function decidePatch(action: 'approve' | 'reject') {
    if (debugSession === null || patchWorkflow === null) return;
    setBusyAction(action); setError(null);
    try {
      const result = await request<PatchActionResponse>(`/api/v1/sessions/${debugSession.id}/patches/${patchWorkflow.proposal.id}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_revision: debugSession.revision }),
      });
      setDebugSession(result.session); setPatchWorkflow(result.workflow);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusyAction(null); }
  }

  async function rollbackPatch() {
    if (debugSession === null || patchWorkflow === null) return;
    if (!window.confirm('Restore files to the state before this PocketPilot patch?')) return;
    setBusyAction('rollback'); setError(null);
    try {
      const result = await request<PatchActionResponse>(`/api/v1/sessions/${debugSession.id}/patches/${patchWorkflow.proposal.id}/rollback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_revision: debugSession.revision }),
      });
      setDebugSession(result.session); setPatchWorkflow(result.workflow);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusyAction(null); }
  }

  async function retryAnalysis() {
    if (debugSession === null || debugSession.state !== 'FAILED' || !errorText.trim()) return;
    setBusyAction('retry'); setError(null);
    try {
      const completed = await request<AnalysisExecutionResponse>(`/api/v1/sessions/${debugSession.id}/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_type: 'TEXT', raw_text: errorText.trim(), file_hint: fileHint.trim() || null, language_hint: languageHint.trim() || null, framework_hint: frameworkHint.trim() || null, expected_revision: debugSession.revision }),
      });
      setAnalysis(completed.analysis); setDebugSession(completed.session); setPatchWorkflow(null);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusyAction(null); }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">P</span>
          <div><strong>PocketPilot</strong><span>Desktop Agent</span></div>
        </div>
        <div className="security-badge"><i /> Local security boundary active</div>
      </header>

      <section className="intro">
        <div>
          <span className="kicker">REPOSITORY CONTROL PLANE</span>
          <h1>Inspect locally.<br />Execute deliberately.</h1>
        </div>
        <p>Select one project root. PocketPilot indexes safe metadata and offers only evidence-backed build and test actions.</p>
      </section>

      <section className="workspace-bar">
        <label htmlFor="workspace-path">WORKSPACE PATH</label>
        <div className="workspace-input-row">
          <input
            id="workspace-path"
            onChange={(event) => setWorkspacePath(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void inspectWorkspace(); }}
            placeholder="C:\path\to\your\project"
            spellCheck={false}
            value={workspacePath}
          />
          <button className="primary-button" disabled={busyAction !== null} onClick={() => void inspectWorkspace()} type="button">
            {busyAction === 'inspect' ? 'INSPECTING…' : 'INSPECT PROJECT'}
          </button>
        </div>
        <p className="input-note">No files are modified. Secret-like content and generated directories are excluded.</p>
      </section>

      {error !== null && <div className="error-banner"><strong>REQUEST BLOCKED</strong>{error}</div>}

      {workspace === null ? <EmptyState /> : (
        <>
          <section className="project-grid">
            <article className="panel project-summary">
              <div className="panel-heading">
                <div><span className="kicker">SELECTED PROJECT</span><h2>{workspace.name}</h2></div>
                <span className="scan-time">{workspace.scan_duration_ms} ms scan</span>
              </div>
              <p className="local-path">{workspace.root_path}</p>
              <div className="summary-metrics">
                <Metric label="files indexed" value={workspace.file_count.toLocaleString()} />
                <Metric label="relevant files" value={workspace.relevant_file_count.toLocaleString()} />
                <Metric label="metadata size" value={formatBytes(workspace.total_size)} />
                <Metric label="git branch" value={workspace.git_branch ?? (workspace.git_detected ? 'detached' : 'none')} />
              </div>
              {workspace.scan_truncated && <p className="warning">Scan limits were reached; results are intentionally truncated.</p>}
            </article>

            <article className="panel detection-panel">
              <span className="kicker">DETECTED STACK</span>
              <DetectionGroup label="Projects" values={workspace.project_types.map((item) => item.project_type)} />
              <DetectionGroup label="Frameworks" values={workspace.frameworks.map((item) => item.name)} />
              <DetectionGroup label="Build systems" values={workspace.build_systems} />
              <DetectionGroup label="Package managers" values={workspace.package_managers} />
            </article>
          </section>

          <section className="lower-grid">
            <article className="panel language-panel">
              <span className="kicker">LANGUAGES</span>
              <div className="language-list">
                {workspace.languages.map((language) => <div className="language-row" key={language.name}><span>{language.name}</span><strong>{language.files}</strong></div>)}
                {workspace.languages.length === 0 && <p className="muted">No supported source languages detected.</p>}
              </div>
            </article>

            <article className="panel actions-panel">
              <div className="panel-heading">
                <div><span className="kicker">AVAILABLE SAFE ACTIONS</span><h2>Explicit execution only</h2></div>
                <span className="action-count">{workspace.detected_commands.length}</span>
              </div>
              <div className="action-list">
                {workspace.detected_commands.map((command) => (
                  <button className="command-button" disabled={busyAction !== null} key={command.id} onClick={() => void runCommand(command)} type="button">
                    <span><strong>{busyAction === command.id ? 'RUNNING…' : command.label}</strong><code>{command.display_command}</code></span>
                    <b>{command.category}</b>
                  </button>
                ))}
                {workspace.detected_commands.length === 0 && <p className="muted">No applicable allowlisted command is available on this machine.</p>}
              </div>
            </article>
          </section>

          <section className="analysis-panel">
            <div className="panel-heading">
              <div><span className="kicker">LOCAL ROOT-CAUSE ANALYSIS</span><h2>Paste the failure exactly as shown</h2></div>
              <span className={`provider-badge ${provider?.available === true ? 'provider-ready' : 'provider-offline'}`}>
                {provider === null ? 'provider unknown' : `${provider.provider} · ${provider.available ? 'ready' : provider.status}`}
              </span>
            </div>
            <p className="analysis-note">Read-only: bounded source windows are analyzed locally. No patch is generated, no command runs, and no file is changed.</p>
            <textarea aria-label="Error or stack trace" onChange={(event) => setErrorText(event.target.value)} placeholder="Paste an exception, traceback, or compiler error…" spellCheck={false} value={errorText} />
            <div className="analysis-controls">
              <input aria-label="Optional file hint" onChange={(event) => setFileHint(event.target.value)} placeholder="Optional file hint, e.g. UserService.java" value={fileHint} />
              <input aria-label="Optional language hint" onChange={(event) => setLanguageHint(event.target.value)} placeholder="Language, e.g. Java" value={languageHint} />
              <input aria-label="Optional framework hint" onChange={(event) => setFrameworkHint(event.target.value)} placeholder="Framework, e.g. Spring" value={frameworkHint} />
              <button className="primary-button" disabled={busyAction !== null} onClick={() => void analyzeError()} type="button">
                {busyAction === 'analyze' ? 'ANALYZING LOCALLY…' : 'ANALYZE ROOT CAUSE'}
              </button>
            </div>
            {analysisEvents.length > 0 && <div className="analysis-timeline">{analysisEvents.slice(-6).map((event) => <span key={event.id}>{event.name.replaceAll('_', ' ')}</span>)}</div>}
          </section>
        </>
      )}

      {commandRun !== null && <CommandResult result={commandRun} />}
      {analysis !== null && <AnalysisResultView analysis={analysis} busy={busyAction !== null} onGenerate={() => void generateFix()} />}
      {patchWorkflow !== null && <PatchReview busyAction={busyAction} onApprove={() => void decidePatch('approve')} onReject={() => void decidePatch('reject')} onRetry={() => void retryAnalysis()} onRollback={() => void rollbackPatch()} workflow={patchWorkflow} />}
      <footer><span>POCKETPILOT / DESKTOP AGENT 0.1.0</span><span>shell=False · bounded output · explicit approval</span></footer>
    </main>
  );
}

function EmptyState() {
  return <section className="empty-state"><div className="empty-mark">⌁</div><h2>No workspace selected</h2><p>Repository access begins only after you provide and inspect one explicit project root.</p></section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function DetectionGroup({ label, values }: { label: string; values: ReadonlyArray<string> }) {
  return <div className="detection-group"><span>{label}</span><div>{values.length === 0 ? <i>None detected</i> : values.map((value) => <b key={value}>{value}</b>)}</div></div>;
}

function CommandResult({ result }: { result: CommandRun }) {
  return (
    <section className="result-panel">
      <div className="result-heading">
        <div><span className="kicker">COMMAND RESULT</span><h2>{result.display_command}</h2></div>
        <span className={`result-status status-${result.status.toLowerCase()}`}>{result.status}</span>
      </div>
      <div className="result-metrics">
        <Metric label="duration" value={`${(result.duration_ms / 1000).toFixed(2)}s`} />
        <Metric label="exit code" value={result.exit_code?.toString() ?? '—'} />
        <Metric label="output capped" value={result.output_truncated ? 'yes' : 'no'} />
      </div>
      <div className="output-grid"><OutputBlock label="STDOUT" value={result.stdout} /><OutputBlock label="STDERR" value={result.stderr} /></div>
    </section>
  );
}

function OutputBlock({ label, value }: { label: string; value: string }) {
  return <div className="output-block"><span>{label}</span><pre>{value || '(empty)'}</pre></div>;
}

function AnalysisResultView({ analysis, busy, onGenerate }: { analysis: AnalysisRecord; busy: boolean; onGenerate: () => void }) {
  const result = analysis.result;
  return (
    <section className="analysis-result">
      <div className="result-heading">
        <div><span className="kicker">VALIDATED ROOT CAUSE</span><h2>{result.summary}</h2></div>
        <span className={`confidence confidence-${result.confidence.toLowerCase()}`}>{result.confidence} CONFIDENCE</span>
      </div>
      <p className="root-cause">{result.root_cause}</p>
      <p className="analysis-note">{result.explanation}</p>
      <div className="result-metrics">
        <Metric label="likely file" value={result.likely_file ?? 'not established'} />
        <Metric label="line" value={result.likely_line?.toString() ?? '—'} />
        <Metric label="provider" value={`${analysis.provider} / ${analysis.model}`} />
        <Metric label="total time" value={`${analysis.timings.total_ms} ms`} />
      </div>
      <div className="evidence-list">
        {result.evidence.map((item) => <div key={`${item.relative_path}:${item.line ?? 0}`}><code>{item.relative_path}{item.line === null ? '' : `:${item.line}`}</code><p>{item.observation}</p></div>)}
        {result.evidence.length === 0 && <p className="muted">No repository location could be validated from the available context.</p>}
      </div>
      {result.warnings.length > 0 && <ul className="analysis-warnings">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      <div className="repair-strategy"><span className="kicker">REPAIR STRATEGY</span><p>{result.repair_strategy}</p></div>
      <div className="analysis-boundary"><button className="primary-button patch-generate" disabled={busy} onClick={onGenerate} type="button">{busy ? 'WORKING…' : 'GENERATE FIX'}</button><span>Generation creates an untrusted proposal only. No file changes before approval.</span></div>
    </section>
  );
}

function PatchReview({ busyAction, onApprove, onReject, onRetry, onRollback, workflow }: { busyAction: string | null; onApprove: () => void; onReject: () => void; onRetry: () => void; onRollback: () => void; workflow: PatchWorkflowView }) {
  const proposal = workflow.proposal;
  const awaiting = workflow.status === 'AWAITING_APPROVAL';
  const rollbackAvailable = workflow.rollback_status === 'AVAILABLE' && ['VERIFIED', 'FAILED'].includes(workflow.status);
  return (
    <section className="patch-review">
      <div className="result-heading"><div><span className="kicker">PROPOSED FIX</span><h2>{proposal.title}</h2></div><span className={`risk risk-${workflow.validation.risk.toLowerCase()}`}>{workflow.validation.risk} RISK</span></div>
      <p className="root-cause">{proposal.summary}</p>
      <div className="result-metrics"><Metric label="files" value={proposal.files.length.toString()} /><Metric label="additions" value={`+${workflow.validation.additions}`} /><Metric label="deletions" value={`-${workflow.validation.deletions}`} /><Metric label="status" value={workflow.status} /></div>
      {proposal.files.map((file) => <article className="diff-card" key={file.relative_path}><div><code>{file.relative_path}</code><span>+{file.additions} / -{file.deletions}</span></div><pre>{file.unified_diff.split('\n').map((line, index) => <span className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : ''} key={`${index}-${line}`}>{line || ' '}{'\n'}</span>)}</pre><p>{file.explanation}</p></article>)}
      <div className="patch-explanation"><span className="kicker">EXPECTED EFFECT</span><p>{proposal.expected_effect}</p></div>
      {workflow.test_result !== null && <div className={`verification ${workflow.test_result.passed ? 'verification-pass' : 'verification-fail'}`}><strong>{workflow.test_result.passed ? '✓ FIX VERIFIED' : '✕ FIX NOT VERIFIED'}</strong><span>{workflow.test_result.command?.display_command ?? 'No safe validation command'} · {workflow.test_result.duration_ms} ms</span></div>}
      {workflow.status === 'ROLLED_BACK' && <div className="verification"><strong>ROLLED BACK</strong><span>Original files restored successfully.</span></div>}
      <div className="patch-actions">
        {awaiting && <><button className="primary-button" disabled={busyAction !== null} onClick={onApprove} type="button">{busyAction === 'approve' ? 'APPLYING & TESTING…' : 'APPROVE FIX'}</button><button className="secondary-button" disabled={busyAction !== null} onClick={onReject} type="button">REJECT</button></>}
        {['FAILED', 'REJECTED'].includes(workflow.status) && <button className="secondary-button" disabled={busyAction !== null} onClick={onRetry} type="button">{busyAction === 'retry' ? 'ANALYZING…' : 'TRY ANOTHER FIX'}</button>}
        {rollbackAvailable && <button className="secondary-button" disabled={busyAction !== null} onClick={onRollback} type="button">{busyAction === 'rollback' ? 'RESTORING…' : 'UNDO FIX'}</button>}
      </div>
    </section>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const detail = errorDetail(payload) ?? `Request failed (${response.status}).`;
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

function errorDetail(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('detail' in value)) return null;
  if (typeof value.detail === 'string') return value.detail;
  if (typeof value.detail === 'object' && value.detail !== null && 'message' in value.detail && typeof value.detail.message === 'string') {
    const status = 'status' in value.detail && typeof value.detail.status === 'string' ? `${value.detail.status}: ` : '';
    return `${status}${value.detail.message}`;
  }
  return null;
}

function eventSocketUrl(sessionId: string, afterSequence: number): string {
  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/api/v1/sessions/${encodeURIComponent(sessionId)}/events/ws`;
  url.search = `after_sequence=${afterSequence}`;
  return url.toString();
}

function isEventMessage(value: unknown): value is { type: 'event'; event: AgentEvent } {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'event' && 'event' in value;
}

function isSnapshotMessage(value: unknown): value is { type: 'snapshot'; events: ReadonlyArray<AgentEvent> } {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'snapshot' && 'events' in value && Array.isArray(value.events);
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'The local agent request failed.';
}
