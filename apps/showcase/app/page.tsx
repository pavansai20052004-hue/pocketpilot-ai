import {
  ArrowDown, BrainCircuit, Camera, Check, CheckCircle2, GitCompare, Laptop,
  LockKeyhole, RotateCcw, ScanLine, ShieldCheck, Smartphone, Sparkles, WifiOff,
} from 'lucide-react';

const tour = [
  ['01', 'SCAN', 'Capture a visible failure on the phone. OCR stays on-device.'],
  ['02', 'UNDERSTAND', 'The laptop selects bounded repository context for local AI analysis.'],
  ['03', 'REVIEW', 'Inspect the root cause and exact proposed diff before anything changes.'],
  ['04', 'VERIFY', 'Approve once. PocketPilot applies the patch and runs the real project tests.'],
] as const;

const features = [
  [Camera, 'On-device vision', 'Photograph a terminal failure or paste error text. Images are processed on the phone, not uploaded.'],
  [BrainCircuit, 'Local AI reasoning', 'A model running through Ollama analyzes bounded code context on the paired laptop.'],
  [GitCompare, 'Reviewable patches', 'See the target file, exact additions, risk level, and expected effect before approval.'],
  [ShieldCheck, 'Closed action vocabulary', 'Voice can request only the same state-checked actions exposed by visible controls.'],
  [RotateCcw, 'Verified rollback', 'Every approved change keeps a recovery path so the original files can be restored.'],
  [WifiOff, 'Local-first boundary', 'The repository, source context, generated diff, tests, and session data remain on your laptop.'],
] as const;

const stack = ['React Native + Expo', 'FastAPI + Python', 'Ollama', 'qwen3-coder:30b', 'ML Kit OCR', 'WebSocket', 'React + TypeScript', 'pytest + Maven'];

const faqs = [
  ['Does the website connect to a repository?', 'No. This public page is an illustrative product tour. The working PocketPilot agent runs locally after an authenticated phone-to-laptop pairing.'],
  ['Can voice run arbitrary shell commands?', 'No. PocketPilot intentionally rejects shell, filesystem, publishing, and instruction-override requests. Voice maps only to a small supported command set.'],
  ['Does approving a fix immediately trust the model?', 'No. The proposed patch is shown first, explicit human approval is required, and the registered project validation command must pass.'],
  ['What leaves the laptop?', 'The public presentation site contains product information only. Repository files, model prompts, patches, tests, device sessions, and local addresses are not part of it.'],
] as const;

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="PocketPilot AI home">
          <span className="brand-mark">P</span><span>POCKETPILOT <i>AI</i></span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#tour">Product tour</a><a href="#proof">Proof</a><a className="nav-cta" href="#architecture">Architecture</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow"><span /> PHONE-CONTROLLED DEVELOPER ASSISTANT</p>
          <h1>See it.<br />Say it.<br /><em>Fix it.</em></h1>
          <p className="hero-deck">Turn a visible software failure into a reviewed patch and a real verified test result—from the phone in your hand.</p>
          <div className="hero-actions">
            <a className="primary-cta" href="#tour">Explore the flow <ArrowDown size={18} /></a>
            <span className="local-pill"><ShieldCheck size={16} /> Repository stays on your laptop</span>
          </div>
        </div>
        <div className="hero-instrument" aria-label="PocketPilot verified workflow preview">
          <div className="instrument-bar"><span>LIVE WORKFLOW</span><span className="ready"><i /> LOCAL AI</span></div>
          <div className="instrument-screen">
            <div className="terminal-line"><span>ERROR</span><code>user_service.py:5</code></div>
            <div className="diagnosis">
              <span className="diagnosis-label">ROOT CAUSE FOUND</span><strong>Missing value dereferenced</strong>
              <p>The repository lookup can return <code>None</code> before the name is accessed.</p>
            </div>
            <div className="mini-diff"><span>+ if user is None:</span><span>+ &nbsp;&nbsp;return &quot;Unknown&quot;</span></div>
            <div className="verified"><Check size={22} strokeWidth={3} /><span><b>FIX VERIFIED</b><small>2 / 2 REAL TESTS PASSED</small></span></div>
          </div>
          <div className="instrument-foot"><span>HUMAN APPROVAL REQUIRED</span><span>ROLLBACK READY</span></div>
        </div>
      </section>

      <section className="problem-section" id="problem">
        <div className="problem-index">01 / THE PROBLEM</div>
        <div>
          <h2>Debugging breaks when the developer leaves the keyboard.</h2>
          <p>A failed build on one screen, a codebase on another, and no safe way to move from observation to action. PocketPilot turns the phone into a deliberate control surface—not a remote shell.</p>
        </div>
        <div className="problem-callout">
          <strong>THE DESIGN QUESTION</strong>
          <p>How can a phone help diagnose and repair code without sending the repository to a cloud service or letting voice bypass human review?</p>
        </div>
      </section>

      <section className="tour-section" id="tour">
        <div className="section-heading">
          <p className="eyebrow"><Sparkles size={14} /> INTERACTIVE PRODUCT TOUR</p>
          <h2>One controlled path from failure to proof.</h2>
          <p>This tour illustrates the verified PocketPilot workflow. It is not connected to a live repository.</p>
        </div>
        <div className="tour-grid">
          {tour.map(([number, title, description], index) => (
            <article className="tour-step" key={title}>
              <div className="step-top"><span>{number}</span>{index === 0 ? <ScanLine size={24} /> : <span className="step-signal" />}</div>
              <h3>{title}</h3><p>{description}</p><div className="step-progress"><i style={{ width: `${(index + 1) * 25}%` }} /></div>
            </article>
          ))}
        </div>
      </section>

      <section className="proof-strip" id="proof" aria-label="Verified results">
        <div><strong>5 / 5</strong><span>REAL LOCAL MODEL<br />PYTHON QUALIFICATION</span></div>
        <div><strong>2 / 2</strong><span>REAL PYTESTS<br />AFTER PATCH</span></div>
        <div><strong>1</strong><span>REVIEWED FILE<br />CHANGED</span></div>
        <div><strong>0</strong><span>CLOUD REPOSITORY<br />UPLOADS</span></div>
      </section>

      <section className="feature-section" id="features">
        <div className="section-kicker">02 / CAPABILITIES</div>
        <div className="feature-intro">
          <h2>Powerful because the boundaries are visible.</h2>
          <p>PocketPilot makes the security model part of the product experience: local analysis, bounded tools, explicit approval, real tests, and recoverable changes.</p>
        </div>
        <div className="feature-grid">
          {features.map(([Icon, title, description]) => (
            <article className="feature-card" key={title}><Icon size={24} /><h3>{title}</h3><p>{description}</p></article>
          ))}
        </div>
      </section>

      <section className="architecture-section" id="architecture">
        <div className="architecture-copy">
          <p className="eyebrow"><span /> LOCAL-FIRST ARCHITECTURE</p>
          <h2>The phone directs.<br />The laptop owns.</h2>
          <p>The mobile app sends reviewed intent to an authenticated local agent. That agent alone owns repository paths, bounded context selection, patch application, verification, and rollback.</p>
          <ul>
            <li><CheckCircle2 size={18} /> Short-lived pairing and device session</li>
            <li><CheckCircle2 size={18} /> Registered projects and fixed validation commands</li>
            <li><CheckCircle2 size={18} /> Private local model endpoint</li>
          </ul>
        </div>
        <div className="architecture-diagram" aria-label="PocketPilot system architecture">
          <div className="arch-node phone"><Smartphone /><span><b>PHONE</b><small>OCR · VOICE · REVIEW</small></span></div>
          <div className="arch-link"><span>AUTHENTICATED LOCAL SESSION</span><i /></div>
          <div className="arch-node agent"><Laptop /><span><b>LAPTOP AGENT</b><small>POLICY · CONTEXT · PATCH · TEST</small></span></div>
          <div className="arch-branches">
            <div><BrainCircuit /><b>OLLAMA</b><small>LOCAL MODEL</small></div>
            <div><LockKeyhole /><b>REPOSITORY</b><small>NEVER UPLOADED</small></div>
          </div>
        </div>
      </section>

      <section className="safety-section" id="safety">
        <div className="safety-head"><p className="section-kicker">03 / SAFETY + PRIVACY</p><h2>Approval is a state,<br />not a magic word.</h2></div>
        <div className="safety-rules">
          <article><span>01</span><h3>Nothing to confirm means nothing executes.</h3><p>Saying “yes” is accepted only when a specific reviewable action is already awaiting confirmation.</p></article>
          <article><span>02</span><h3>Unsafe requests stay unsupported.</h3><p>Arbitrary shell, filesystem, publishing, and instruction-override commands are outside the mobile command vocabulary.</p></article>
          <article><span>03</span><h3>A passing test is the finish line.</h3><p>A patch is not called verified until the laptop runs the project’s registered validation command successfully.</p></article>
        </div>
      </section>

      <section className="results-section">
        <div><p className="eyebrow"><span /> REAL RELEASE EVIDENCE</p><h2>A demo that returns evidence, not theatre.</h2></div>
        <div className="result-ledger">
          <div><span>INPUT</span><strong>Real terminal failure</strong><small>Camera or reviewed text</small></div>
          <div><span>ANALYSIS</span><strong>Local 30B coding model</strong><small>Bounded repository context</small></div>
          <div><span>CHANGE</span><strong>Exact diff before approval</strong><small>Risk and expected effect shown</small></div>
          <div><span>PROOF</span><strong>Project tests + undo</strong><small>Execution result returned to phone</small></div>
        </div>
      </section>

      <section className="stack-section">
        <p className="section-kicker">04 / TECHNOLOGY</p><h2>Built across mobile, local AI, and real developer tooling.</h2>
        <div className="stack-list">{stack.map((item) => <span key={item}>{item}</span>)}</div>
      </section>

      <section className="faq-section" id="faq">
        <div><p className="section-kicker">05 / FAQ</p><h2>Clear answers before the demo.</h2></div>
        <div className="faq-list">
          {faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark">P</span><span>POCKETPILOT <i>AI</i></span></a>
        <p>See it. Say it. Fix it.</p><span>PUBLIC PRODUCT TOUR · LOCAL PRODUCT RUNTIME</span>
      </footer>
    </main>
  );
}
