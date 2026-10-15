import { focusSection } from "./routes";
import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "./theme";

const GITHUB = "https://github.com/yuzhihao1212/TriVerity";

// README.md (live sample evaluation, 16 Oct 2026) and docs/simulation.md
// (offline, seed 7). Keep the values and their measurement context together.
export const LANDING_RESULTS = [
  { value: "9/9", label: "Sample rulings correct", detail: "Live Hy3 evaluation, including the organisers’ case." },
  { value: "78%", label: "Resolved without a human", detail: "390 of 500 generated disputes, evaluated offline." },
  { value: "100/100", label: "Same facts, same ruling", detail: "Repeated rulings in the offline simulation." },
  { value: "16–18 s", label: "About $0.002 per dispute", detail: "Live Hy3 measurements; about 10,000 tokens per dispute." },
] as const;

const STEPS = [
  { title: "Evidence collection", detail: "Code verifies GPS, chat, fares and history; each advocate’s AI requests the records it needs.", ai: true, code: true },
  { title: "Rider & Driver advocates", detail: "Each side builds its case from the same verified evidence.", ai: true },
  { title: "Rebuttal round", detail: "Each advocate answers the other side once.", ai: true },
  { title: "Fraud & precedent checks", detail: "Code checks bad-faith signals and retrieves similar past rulings.", code: true },
  { title: "Policy rules decide", detail: "A refund, compensation or no action, with confidence; uncertain or risky cases go to a human.", code: true },
  { title: "Judge explains & parties notified", detail: "AI explains the ruling and prepares a separate message for each party.", ai: true },
] as const;

const TRUST = [
  ["Rules decide. AI explains.", "Decisions and amounts come from code. The same facts produce the same ruling, whoever argues the case."],
  ["Arguments checked, not just heard", "Every argument cites evidence IDs and policy rules, and the Judge checks each cited rule against the facts: it holds for that side, favours the other, or doesn’t apply."],
  ["What would change this ruling?", "Every decision includes the facts it turns on and the outcome a different fact would give."],
  ["Safety first, humans in control", "Uncertain or high-risk cases go to a human with a priority tier. Safety cases come first."],
  ["Appeals become precedents", "A human reviewer’s appeal decision becomes a precedent for future cases. This feedback loop is disabled in the public demo."],
  ["Tested against prompt injection", "23 attack scenarios tested offline. Across 17 attacks and 68 live Hy3 runs, no injection changed a ruling."],
];

const CASES = [
  { id: "D001", title: "A detour and a refund", detail: "A longer, slower route and a six-minute stop. See how policy calculates a partial refund.", action: "Try the detour case" },
  { id: "D007", title: "When a human should step in", detail: "A threat in chat and high bad-faith risk trigger escalation, with safety review first.", action: "Try the escalation case" },
  { id: "DISP-002", title: "The organisers’ own case", detail: "A lobby no-show dispute in the organisers’ dataset format. Examine arrival, waiting and contact evidence.", action: "Try the organisers’ case" },
];

export function Landing({ presentation, onTogglePresentation, theme, onToggleTheme }: {
  presentation: boolean; onTogglePresentation: () => void; theme: Theme; onToggleTheme: () => void;
}) {
  return <div className={`landing${presentation ? " presentation-mode" : ""}`}>
    <a className="skip-link" href="#landing-main" onClick={event => { event.preventDefault(); focusSection("landing-main"); }}>Skip to content</a>
    <header className="landing-header">
      <div className="landing-wrap landing-nav">
        <span className="brand">TriVerity</span>
        <nav aria-label="Project"><a href={`${GITHUB}#readme`}>Project docs</a>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button className="secondary-button presentation-toggle" type="button" aria-pressed={presentation} onClick={onTogglePresentation}>Presentation mode</button>
        </nav>
      </div>
    </header>
    <main id="landing-main" tabIndex={-1}>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-wrap">
          <p className="landing-kicker">Multi-agent dispute resolution for Ryde</p>
          <h1 id="landing-title" tabIndex={-1}>TriVerity<span className="landing-dot" aria-hidden="true">.</span></h1>
          <p className="landing-byline">By OeroAI</p>
          <p className="landing-lead">AI agents argue both sides;<br className="landing-desktop-break" /> policy rules decide fairly.</p>
          <p className="landing-intro muted">From disputed trip to an explained ruling. Follow the evidence, hear both sides and see why the decision holds.</p>
          <div className="landing-actions"><a className="landing-primary" href="#/console">Open the reviewer console <span aria-hidden="true">↗</span></a>
            <a href={GITHUB}>View the source on GitHub <span aria-hidden="true">↗</span></a></div>
          <p className="landing-provider muted">Built on Tencent Hy3 via Tencent Cloud TokenHub.</p>
        </div>
      </section>
      <div className="landing-wrap landing-sections">
        <section className="landing-problem" aria-labelledby="problem-title">
          <div><p className="eyebrow">The problem</p><h2 id="problem-title">A disputed ride shouldn’t take days to review.</h2></div>
          <div><p>Ryde’s challenge brief describes <strong>24–72 hour resolutions</strong>, inconsistent rulings and costly manual review of GPS, chat, fares and history.</p>
            <p className="muted">TriVerity brings that evidence into one reviewable case, with clear rules and an explanation for each party.</p></div>
        </section>
        <section aria-labelledby="flow-title">
          <div className="landing-section-head"><p className="eyebrow">How it works</p><h2 id="flow-title">Two sides heard. One accountable decision.</h2><p className="muted">AI handles language. Code verifies facts and applies policy.</p></div>
          <ol className="landing-flow">{STEPS.map((step, index) => <li key={step.title}>
            <span className="landing-step" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div className="landing-step-badges">{"ai" in step && <span className="source-badge llm">AI</span>}{"code" in step && <span className="tag">Code</span>}</div>
            <h3>{step.title}</h3><p className="muted">{step.detail}</p>
          </li>)}</ol>
        </section>
        <section aria-labelledby="trust-title">
          <div className="landing-section-head"><p className="eyebrow">What makes it trustworthy</p><h2 id="trust-title">A ruling you can question, inspect and appeal.</h2></div>
          <div className="landing-trust">{TRUST.map(([title, detail]) => <article className="landing-card" key={title}><h3>{title}</h3><p className="muted">{detail}</p></article>)}</div>
        </section>
        <section className="landing-results" aria-labelledby="results-title">
          <div className="landing-section-head"><p className="eyebrow">Measured results</p><h2 id="results-title">Small sample. Clear benchmarks.</h2></div>
          <dl className="landing-metrics">{LANDING_RESULTS.map(result => <div key={result.label}><dt>{result.label}</dt><dd className="landing-metric-value">{result.value}</dd><dd className="landing-metric-detail">{result.detail}</dd></div>)}</dl>
          <p className="landing-footnote muted">Synthetic data, not production results. Sample accuracy, latency and cost come from live Hy3 measurements; automation and repeatability come from the offline simulation. <a href={`${GITHUB}/blob/main/docs/evaluation.md`}>Evaluation</a> · <a href={`${GITHUB}/blob/main/docs/simulation.md`}>500-dispute simulation</a></p>
        </section>
        <section aria-labelledby="try-title">
          <div className="landing-section-head"><p className="eyebrow">Try these cases</p><h2 id="try-title">Start with a case, then follow the reasoning.</h2><p className="muted">Opening a case loads its evidence. Agents run only when you press “Run agents”.</p></div>
          <div className="landing-cases">{CASES.map(sample => <article className="landing-card" key={sample.id}>
            <span className="landing-case-id">{sample.id}</span><h3>{sample.title}</h3><p className="muted">{sample.detail}</p><a href={`#/console/${sample.id}`}>{sample.action} <span aria-hidden="true">→</span></a>
          </article>)}</div>
        </section>
      </div>
    </main>
    <footer className="landing-footer"><div className="landing-wrap"><div><strong>TriVerity</strong> <span className="byline">By OeroAI</span><p className="muted">Synthetic data; a hackathon prototype.</p></div>
      <nav aria-label="Documentation"><a href={`${GITHUB}/blob/main/docs/architecture.md`}>Architecture</a><a href={`${GITHUB}/blob/main/docs/security.md`}>Security</a><a href={`${GITHUB}/blob/main/docs/evaluation.md`}>Evaluation</a></nav>
    </div></footer>
  </div>;
}
