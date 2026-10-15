import { useEffect, useState, type MouseEvent } from "react";
import { Chip } from "./Chip";
import { Icon } from "./Icon";
import { focusSection } from "./routes";
import { PresentationToggle, ThemeToggle } from "./ThemeToggle";
import type { Theme } from "./theme";
import heroLarge from "./assets/hero-ride-1536.webp";
import heroSmall from "./assets/hero-ride-768.webp";
import problemLarge from "./assets/problem-rider-1400.webp";
import problemSmall from "./assets/problem-rider-760.webp";
import { HERO_ROTATE_MS, HERO_RULINGS, nextHeroIndex } from "./heroRulings";

const GITHUB = "https://github.com/yuzhihao1212/TriVerity";

// README.md (live sample evaluation, 16 Oct 2026) and docs/simulation.md
// (offline, seed 7). Keep the values and their measurement context together.
export const LANDING_RESULTS = [
  { value: "9/9", label: "Sample rulings correct", detail: "Live Hy3 evaluation, including the organisers’ case." },
  { value: "78%", label: "Resolved without a human", detail: "390 of 500 generated disputes, evaluated offline." },
  { value: "100/100", label: "Same facts, same ruling", detail: "Repeated rulings in the offline simulation." },
  { value: "16–18 s", label: "About $0.002 per dispute", detail: "Live Hy3 measurements; about 10,000 tokens per dispute." },
] as const;

// Three stages people can grasp at a glance; the six real steps sit under them as chips.
const STAGES = [
  { icon: "magnifier", verb: "Gather", rest: "the evidence", line: "GPS · chat · fares · history", steps: [
    { title: "Evidence collection", ai: true, code: true, detail: "Code verifies GPS, chat, fares and history; each advocate’s AI requests the records it needs." },
  ] },
  { icon: "bubbles", verb: "Argue", rest: "both sides", line: "Rider AI vs driver AI, one reply each", steps: [
    { title: "Advocates", ai: true, detail: "Each side builds its case from the same verified evidence." },
    { title: "Rebuttal", ai: true, detail: "Each advocate answers the other side once." },
  ] },
  { icon: "scales", verb: "Decide", rest: "fairly", line: "Rules decide, AI explains", steps: [
    { title: "Fraud & precedent checks", code: true, detail: "Code checks bad-faith signals and retrieves similar past rulings." },
    { title: "Policy rules", code: true, detail: "A refund, compensation or no action, with confidence; uncertain or risky cases go to a human." },
    { title: "Judge explains", ai: true, detail: "AI explains the ruling and prepares a separate message for each party." },
  ] },
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

export function Landing({ presentation, onTogglePresentation, theme, onToggleTheme, onOpenConsole }: {
  presentation: boolean; onTogglePresentation: () => void; theme: Theme; onToggleTheme: () => void;
  /** CTA click handler: plays the console intro on a plain left-click, otherwise leaves the link alone. */
  onOpenConsole?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return <div className={`landing${presentation ? " presentation-mode" : ""}`}>
    <a className="skip-link" href="#landing-main" onClick={event => { event.preventDefault(); focusSection("landing-main"); }}>Skip to content</a>
    <header className="landing-header">
      <div className="landing-wrap landing-nav">
        <span className="brand">TriVerity</span>
        <nav aria-label="Project"><a href={`${GITHUB}#readme`}>Project docs</a>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <PresentationToggle presentation={presentation} onToggle={onTogglePresentation} />
        </nav>
      </div>
    </header>
    <main id="landing-main" tabIndex={-1}>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-wrap landing-hero-grid">
          <div className="landing-hero-copy">
          <p className="landing-kicker">Multi-agent dispute resolution for Ryde</p>
          <h1 id="landing-title" tabIndex={-1}>TriVerity<span className="landing-dot" aria-hidden="true">.</span></h1>
          <p className="landing-byline">By OeroAI</p>
          <p className="landing-lead">AI agents argue both sides;<br className="landing-desktop-break" /> policy rules decide fairly.</p>
          <p className="landing-intro muted">From disputed trip to an explained ruling. Follow the evidence, hear both sides and see why the decision holds.</p>
          <div className="landing-actions"><a className="landing-primary" href="#/console" onClick={onOpenConsole}>Open the reviewer console <span aria-hidden="true">↗</span></a>
            <a href={GITHUB}>View the source on GitHub <span aria-hidden="true">↗</span></a></div>
          <p className="landing-provider muted">Built on Tencent Hy3 via Tencent Cloud TokenHub.</p>
          </div>
          <HeroVisual />
        </div>
      </section>
      <div className="landing-wrap landing-sections">
        <section className="landing-problem" aria-labelledby="problem-title">
          <div><p className="eyebrow">The problem</p><h2 id="problem-title">A disputed ride shouldn’t take days to review.</h2></div>
          <div><p>Ryde’s challenge brief describes <strong>24–72 hour resolutions</strong>, inconsistent rulings and costly manual review of GPS, chat, fares and history.</p>
            <p className="muted">TriVerity brings that evidence into one reviewable case, with clear rules and an explanation for each party.</p></div>
          <ProblemVisual />
        </section>
        <section aria-labelledby="flow-title">
          <div className="landing-section-head"><p className="eyebrow">How it works</p><h2 id="flow-title">Two sides heard. One accountable decision.</h2><p className="muted">AI handles language. Code verifies facts and applies policy.</p></div>
          <ol className="landing-stages">{STAGES.map((stage, index) => <li key={stage.verb} className="landing-stage">
            <span className="landing-stage-icon" aria-hidden="true"><Icon name={stage.icon} /></span>
            <h3><span className="sr-only">Stage {index + 1}: </span><span className="landing-stage-verb">{stage.verb}</span> {stage.rest}</h3>
            <p className="landing-stage-line">{stage.line}</p>
            <ul className="chip-row landing-stage-steps" aria-label={`Steps in ${stage.verb}`}>{stage.steps.map(step => <li key={step.title}>
              <Chip size="sm" tone={"ai" in step ? "brand" : "outline"} icon={"ai" in step ? "sparkle" : undefined} title={step.detail}>
                {step.title}{"ai" in step && "code" in step && " · AI + code"}<span className="sr-only">{"ai" in step ? ", AI" : ", code"}</span>
              </Chip>
            </li>)}</ul>
            <details className="landing-stage-more">
              <summary>How</summary>
              <ul>{stage.steps.map(step => <li key={step.title}><strong>{step.title}.</strong> {step.detail}</li>)}</ul>
            </details>
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

/** The people a dispute is about, with real rulings TriVerity gave on the sample cases, rotating. */
function HeroVisual() {
  return <figure className="landing-hero-visual">
    <img src={heroLarge} srcSet={`${heroSmall} 768w, ${heroLarge} 1536w`} sizes="(max-width: 760px) 100vw, 560px"
      width={1536} height={1024} fetchPriority="high" decoding="async"
      alt="A smiling driver turns around in the front seat to greet a rider who is holding a phone at the open rear door." />
    <div className="hero-speed" aria-hidden="true"><span className="hero-dot ok" />Ruled in about 16 s</div>
    <HeroRulingCard />
  </figure>;
}

/**
 * Cycles through example rulings every HERO_ROTATE_MS. Pauses while hovered or focused,
 * and when the viewer presses pause or picks a case; never rotates under reduced motion.
 */
function HeroRulingCard() {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);       // hover or keyboard focus inside
  const [stopped, setStopped] = useState(false); // the pause button, or a case picked by hand
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const change = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const rotating = !reduced && !stopped && HERO_RULINGS.length > 1;
  useEffect(() => {
    if (!rotating || held) return;
    const timer = window.setInterval(() => setIndex(i => nextHeroIndex(i, HERO_RULINGS.length)), HERO_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [rotating, held]);
  const ruling = HERO_RULINGS[index];
  if (!ruling) return null;
  return <section className={`hero-ruling ${ruling.tone}`} aria-roledescription="carousel" aria-label="Example rulings"
    onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}
    onFocus={() => setHeld(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false); }}>
    {/* Auto-rotation is not announced; a case the viewer picks is. */}
    <p className="sr-only" aria-live={stopped ? "polite" : "off"}>{ruling.label}</p>
    {/* Every slide shares one grid cell, so the card is always as tall as the tallest and never jumps. */}
    <div className="hero-ruling-slides" aria-hidden="true">
      {HERO_RULINGS.map((item, i) => <div key={item.id} className={`hero-ruling-slide ${item.tone}${i === index ? " active" : ""}`}>
        <div className="hero-ruling-head">
          <span className="hero-ruling-status"><span className={`hero-dot ${item.tone}`} />{item.status}</span>
          <span className="hero-ruling-id">{item.id} · {item.kind}</span>
        </div>
        <p className="hero-ruling-outcome">{item.outcome}{item.amount && <> <strong>{item.amount}</strong></>}</p>
        <p className="hero-ruling-why">{item.why}</p>
      </div>)}
    </div>
    <div className="hero-ruling-foot">
      <span className="hero-confidence" aria-hidden="true">{ruling.confidence}</span>
      <span className="hero-controls">
        {HERO_RULINGS.map((item, i) => <button key={item.id} type="button" className="hero-pick" aria-pressed={i === index}
          aria-label={`Show example ${i + 1} of ${HERO_RULINGS.length}: ${item.id}`} onClick={() => { setIndex(i); setStopped(true); }} />)}
        {!reduced && HERO_RULINGS.length > 1 && <button type="button" className="hero-pause" onClick={() => setStopped(s => !s)}
          aria-label={stopped ? "Play example rulings" : "Pause example rulings"}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
            {stopped ? <path d="M8 5.5v13l10-6.5Z" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />}
          </svg>
        </button>}
      </span>
    </div>
  </section>;
}

/** The pain before TriVerity: a no-show fee the rider disputes, then days of waiting (the brief's 24–72 h). */
function ProblemVisual() {
  return <figure className="landing-problem-visual">
    <img src={problemLarge} srcSet={`${problemSmall} 760w, ${problemLarge} 1400w`} sizes="(max-width: 760px) 100vw, 1200px"
      width={1400} height={741} loading="lazy" decoding="async"
      alt="A rider frowns at a phone while adjusting their glasses, confused by what they are reading." />
    <div className="problem-notice" role="img"
      aria-label="Illustration: a ride-app notification. No-show fee charged, $4.00: your driver marked you as a no-show. Dispute filed; typical wait 24 to 72 hours.">
      <div className="problem-notice-head" aria-hidden="true"><span className="problem-notice-app">Ryde</span><span>now</span></div>
      <p className="problem-notice-title" aria-hidden="true">No-show fee charged: <strong>$4.00</strong></p>
      <p className="problem-notice-body" aria-hidden="true">“Your driver marked you as a no-show.”</p>
      <p className="problem-notice-foot" aria-hidden="true"><span className="problem-wait">⏱</span> Dispute filed · typical wait <strong>24–72 h</strong></p>
    </div>
  </figure>;
}
