import { useEffect, useReducer, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { CLOSED_TRUST_TILE, trustTileState } from "./trustTileState";
import { Chip } from "./Chip";
import { CASES } from "./landingCases";
import { Icon } from "./Icon";
import { HunyuanMark } from "./SourceBadge";
import { focusSection } from "./routes";
import { PresentationToggle, ThemeToggle } from "./ThemeToggle";
import type { Theme } from "./theme";
import heroLarge from "./assets/hero-ride-1536.webp";
import heroSmall from "./assets/hero-ride-768.webp";
import problemLarge from "./assets/problem-rider-1400.webp";
import problemSmall from "./assets/problem-rider-760.webp";
import hunyuanLockup from "./assets/logos/tencent-hunyuan-lockup.webp";
import hunyuanLockupDark from "./assets/logos/tencent-hunyuan-lockup-dark.webp";
import cloudLockup from "./assets/logos/tencent-cloud.webp";
import cloudLockupDark from "./assets/logos/tencent-cloud-dark.webp";
import { OeroMark } from "./OeroAI";
import { HERO_ROTATE_MS, HERO_RULINGS, nextHeroIndex } from "./heroRulings";
import { AUTOMATION_RING, REPEAT_DOTS, RESULTS_BOX, SAMPLE_TICKS, STOPWATCH } from "./resultsVisuals";

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
    { title: "Evidence collection", ai: true, code: true, detail: "Rules verify GPS, chat, fares and history; each advocate’s AI requests the records it needs." },
  ] },
  { icon: "bubbles", verb: "Argue", rest: "both sides", line: "Rider AI vs driver AI, one reply each", steps: [
    { title: "Advocates", ai: true, detail: "Each side builds its case from the same verified evidence." },
    { title: "Rebuttal", ai: true, detail: "Each advocate answers the other side once." },
  ] },
  { icon: "scales", verb: "Decide", rest: "fairly", line: "Rules decide, AI explains", steps: [
    { title: "Fraud & precedent checks", code: true, detail: "Rules check bad-faith signals and retrieve similar past rulings." },
    { title: "Policy rules", code: true, detail: "A refund, compensation or no action, with confidence; uncertain or risky cases go to a human." },
    { title: "Judge explains", ai: true, detail: "AI explains the ruling and prepares a separate message for each party." },
  ] },
] as const;

interface TrustTile {
  icon: "scales" | "magnifier" | "person" | "shield" | "books" | "lock";
  title: string;
  proof?: string;
  detail: string;
  note?: string;
}

export const TRUST_TILES: readonly TrustTile[] = [
  { icon: "scales", title: "Rules decide, AI explains", detail: "Decisions and amounts come from fixed rules. The same facts produce the same ruling, whoever argues the case." },
  { icon: "magnifier", title: "Every argument fact-checked", detail: "Every argument cites evidence and policy rules, and the Judge checks each cited rule against the facts: it holds for that side, favours the other, or doesn't apply." },
  { icon: "person", title: "Fair to both sides", proof: "500/500 fairness checks", detail: "Party history never changed a policy ruling: 500 of 500 simulated disputes got the same decision with histories removed or swapped. History is only used to check for bad-faith patterns." },
  { icon: "shield", title: "Humans for risky cases", detail: "Uncertain or high-risk cases go to a human reviewer with a priority tier. Safety cases come first." },
  { icon: "books", title: "Appeals teach the system", detail: "A reviewer's appeal decision becomes a precedent for similar future cases.", note: "Disabled in the public demo." },
  { icon: "lock", title: "Tested against prompt injection", proof: "0 of 68 live runs swayed", detail: "23 attack scenarios tested offline. Across 17 attacks and 68 live Hy3 runs, no injection changed a ruling." },
];

export function Landing({ presentation, onTogglePresentation, theme, onToggleTheme, onOpenConsole }: {
  presentation: boolean; onTogglePresentation: () => void; theme: Theme; onToggleTheme: () => void;
  /** CTA click handler: plays the console intro on a plain left-click, otherwise leaves the link alone. */
  onOpenConsole?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const resultsRef = useResultsAnimation();
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
          <p className="landing-kicker">Multi-Agent Autonomous Dispute Resolution System</p>
          <h1 id="landing-title" tabIndex={-1}>TriVerity<span className="landing-dot" aria-hidden="true">.</span></h1>
          <p className="landing-byline"><OeroMark />By OeroAI</p>
          <p className="landing-lead">Ride disputes resolved fairly<br className="landing-desktop-break" /> in seconds, not days.</p>
          <p className="landing-intro muted">AI agents argue both sides; policy rules decide fairly. Follow the evidence and see why each ruling holds.</p>
          <div className="landing-actions"><a className="landing-primary" href="#/console" onClick={onOpenConsole}>Open the reviewer console <span aria-hidden="true">↗</span></a>
            <a href={GITHUB}>View the source on GitHub <span aria-hidden="true">↗</span></a></div>
          <BuiltOn />
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
          <div className="landing-section-head"><p className="eyebrow">How it works</p><h2 id="flow-title">Two sides heard. One accountable decision.</h2><p className="muted">AI handles language. Rules verify the facts and apply policy.</p></div>
          <ol className="landing-stages">{STAGES.map((stage, index) => <li key={stage.verb} className="landing-stage">
            <span className="landing-stage-icon" aria-hidden="true"><Icon name={stage.icon} /></span>
            <h3><span className="sr-only">Stage {index + 1}: </span><span className="landing-stage-verb">{stage.verb}</span> {stage.rest}</h3>
            <p className="landing-stage-line">{stage.line}</p>
            <ul className="chip-row landing-stage-steps" aria-label={`Steps in ${stage.verb}`}>{stage.steps.map(step => <li key={step.title}>
              <Chip size="sm" tone={"ai" in step ? "ai" : "neutral"} icon={"ai" in step ? undefined : "function"} title={step.detail}>
                {"ai" in step && <HunyuanMark />}
                {step.title}{"ai" in step && "code" in step && " · AI + rules"}<span className="sr-only">{"ai" in step ? ", Hunyuan AI" : ", rules"}</span>
              </Chip>
            </li>)}</ul>
            <details className="landing-stage-more">
              <summary>How</summary>
              <ul>{stage.steps.map(step => <li key={step.title}><strong>{step.title}.</strong> {step.detail}</li>)}</ul>
            </details>
          </li>)}</ol>
        </section>
        <section aria-labelledby="trust-title">
          <div className="landing-section-head"><p className="eyebrow">What makes it trustworthy</p><h2 id="trust-title">A ruling you can question, inspect and appeal.</h2><p className="muted">Select a card for details.</p></div>
          <TrustTiles />
        </section>
        <section ref={resultsRef} className="landing-results" aria-labelledby="results-title">
          <div className="landing-section-head"><p className="eyebrow">Measured results</p><h2 id="results-title">Small sample. Clear benchmarks.</h2></div>
          <dl className="landing-metrics">{LANDING_RESULTS.map((result, index) => <div key={result.label} style={{ "--results-delay": `${index * 120}ms` } as CSSProperties}>
            <dt>{result.label}</dt>
            <dd className="landing-result-visual" aria-hidden="true"><ResultVisual index={index} /></dd>
            <dd className="landing-metric-value">{result.value}</dd><dd className="landing-metric-detail">{result.detail}</dd>
            {index === 1 && <dd className="landing-result-caption">22% go to a human reviewer</dd>}
            {index === 3 && <dd className="landing-result-caption">vs <strong>24–72 h</strong> today (Ryde's brief)</dd>}
          </div>)}</dl>
          <p className="landing-footnote muted">Synthetic data, not production results. Sample accuracy, latency and cost come from live Hy3 measurements; automation and repeatability come from the offline simulation. <a href={`${GITHUB}/blob/main/docs/evaluation.md`}>Evaluation</a> · <a href={`${GITHUB}/blob/main/docs/simulation.md`}>500-dispute simulation</a></p>
        </section>
        <section aria-labelledby="try-title">
          <div className="landing-section-head"><p className="eyebrow">Try these cases</p><h2 id="try-title">Start with a case, then follow the reasoning.</h2><p className="muted">Opening a case loads its evidence. Agents run only when you press “Run agents”.</p></div>
          <div className="landing-cases">{CASES.map(sample => <a className="landing-case" key={sample.id} href={sample.href} aria-label={sample.accessibleName}>
            <span className={`landing-case-icon${sample.tone === "warn" ? " warn" : ""}`} aria-hidden="true"><Icon name={sample.icon} /></span>
            <h3>{sample.title}</h3>
            <div className="chip-row landing-case-evidence">{sample.evidence.map(line => <Chip key={line} size="sm" tone="outline">{line}</Chip>)}</div>
            <p className={`landing-case-outcome tone-${sample.tone}`}><span className="landing-case-dot" aria-hidden="true" /><strong>{sample.outcome}</strong></p>
            <span className="landing-case-footer"><span className="landing-case-id">{sample.id}</span><span aria-hidden="true">·</span><span className="landing-case-action">Open case <span aria-hidden="true">→</span></span></span>
          </a>)}</div>
        </section>
      </div>
    </main>
    <footer className="landing-footer"><div className="landing-wrap"><div><strong>TriVerity</strong> <span className="byline">By OeroAI</span><p className="muted">a hackathon prototype</p></div>
      <nav aria-label="Documentation"><a href={`${GITHUB}/blob/main/docs/architecture.md`}>Architecture</a><a href={`${GITHUB}/blob/main/docs/security.md`}>Security</a><a href={`${GITHUB}/blob/main/docs/evaluation.md`}>Evaluation</a></nav>
    </div>
    <div className="landing-wrap landing-legal">
      <p>Built for Ryde’s challenge at the Tencent Cloud AI Hackathon Singapore 2026. Not affiliated with or endorsed by Ryde.</p>
      <p>© 2026 OeroAI. All rights reserved.</p>
    </div></footer>
  </div>;
}

// Progressive enhancement: the unobserved/default SVGs always show their final state.
function useResultsAnimation() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = ref.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!section || motion.matches || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.3)) return;
      section.classList.add("results-animate");
      observer.disconnect();
    }, { threshold: 0.3 });
    section.classList.add("results-ready");
    observer.observe(section);
    const finish = () => {
      if (!motion.matches) return;
      observer.disconnect();
      section.classList.remove("results-ready", "results-animate");
    };
    motion.addEventListener("change", finish);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", finish);
      section.classList.remove("results-ready", "results-animate");
    };
  }, []);
  return ref;
}

function ResultVisual({ index }: { index: number }) {
  const ring = index === 1 ? AUTOMATION_RING : STOPWATCH;
  return <svg viewBox={`0 0 ${RESULTS_BOX} ${RESULTS_BOX}`} aria-hidden="true" focusable="false">
    {index === 0 && SAMPLE_TICKS.map((tick, i) => <g key={tick.id}>
      <circle className="results-tick-circle" cx={tick.x} cy={tick.y} r={tick.radius}><title>{tick.id}</title></circle>
      <path className="results-pop" style={{ "--results-item-delay": `${i * 40}ms` } as CSSProperties}
        d={`M ${tick.x - 5} ${tick.y} l 3.5 3.5 l 6.5 -7`} />
    </g>)}
    {index === 2 && REPEAT_DOTS.map((dot, i) => <circle key={i} className="results-dot results-pop" cx={dot.x} cy={dot.y} r={dot.radius}
      style={{ "--results-item-delay": `${dot.row * 40}ms` } as CSSProperties} />)}
    {(index === 1 || index === 3) && <>
      <circle className="results-ring-track" cx={ring.x} cy={ring.y} r={ring.radius} strokeWidth={ring.width} />
      <circle className="results-ring" cx={ring.x} cy={ring.y} r={ring.radius} strokeWidth={ring.width}
        strokeDasharray={ring.circumference} strokeDashoffset={ring.offset} transform={`rotate(-90 ${ring.x} ${ring.y})`}
        style={{ "--results-circumference": ring.circumference, "--results-offset": ring.offset } as CSSProperties} />
    </>}
    {index === 3 && <>
      <rect className="results-watch-button" {...STOPWATCH.button} rx="2" />
      <path className="results-watch-stem" d={`M ${STOPWATCH.stem.x} ${STOPWATCH.stem.y1} V ${STOPWATCH.stem.y2}`} />
      <g className="results-watch-hand" style={{ "--results-angle": `${STOPWATCH.handAngle}deg` } as CSSProperties}>
        <path d={`M ${STOPWATCH.x} ${STOPWATCH.y} v ${-STOPWATCH.handLength}`} />
      </g>
      <circle className="results-dot" cx={STOPWATCH.x} cy={STOPWATCH.y} r="3" />
    </>}
  </svg>;
}

function TrustTiles() {
  const [state, dispatch] = useReducer(trustTileState, CLOSED_TRUST_TILE);
  return <div className="landing-trust">{TRUST_TILES.map(tile => {
    const id = `trust-${tile.icon}`, open = state.openId === id;
    return <button type="button" key={id} className={`trust-tile${open ? " is-open" : ""}`}
      aria-expanded={open} aria-controls={`${id}-detail`} aria-describedby={`${id}-detail`} aria-labelledby={`${id}-title`}
      onPointerEnter={event => { if (event.pointerType === "mouse" && window.matchMedia("(hover: hover)").matches) dispatch({ type: "hover", id }); }}
      onPointerLeave={() => dispatch({ type: "leave", id })}
      onFocus={event => { if (event.currentTarget.matches(":focus-visible")) dispatch({ type: "focus", id }); }}
      onBlur={() => dispatch({ type: "blur", id })}
      onClick={() => dispatch({ type: "toggle", id })}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); dispatch({ type: "escape" }); }
        // The description can scroll inside the tile without adding a nested
        // focus target to this button. Touch/wheel scrolling works natively.
        const detail = event.currentTarget.querySelector<HTMLElement>(".trust-tile-detail-body");
        if (open && detail && detail.scrollHeight > detail.clientHeight && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          if (event.key === "Home") detail.scrollTop = 0;
          else if (event.key === "End") detail.scrollTop = detail.scrollHeight;
          else detail.scrollTop += event.key === "ArrowDown" ? 40 : -40;
        }
      }}>
      <span className="sr-only" id={`${id}-title`}>{tile.title}</span>
      <span className="trust-tile-front" aria-hidden="true">
        <span className="landing-stage-icon trust-tile-icon"><Icon name={tile.icon} /></span>
        <span className="trust-tile-title">{tile.title}</span>
        {tile.proof && <span className="trust-tile-proof">{tile.proof}</span>}
      </span>
      <span className="trust-tile-detail" id={`${id}-detail`}>
        <span className="trust-tile-back-title" aria-hidden="true">{tile.title}</span>
        {tile.proof && <span className="trust-tile-proof">{tile.proof}</span>}
        <span className="trust-tile-detail-body"><span>{tile.detail}</span>
          {tile.note && <span className="trust-tile-note"><span aria-hidden="true">ⓘ </span>{tile.note}</span>}
        </span>
      </span>
      <span className="trust-tile-hint" aria-hidden="true">{open ? "✕" : "ⓘ"}</span>
    </button>;
  })}</div>;
}

/** The people a dispute is about, with real rulings TriVerity gave on the sample cases, rotating. */
/**
 * The model and the cloud it is served on, as the official lockups (never redrawn or recoloured).
 * Both theme versions are rendered and CSS shows one: the app's theme toggle sets data-theme,
 * which a <picture> media query can't see. The dark Cloud file has a larger icon, so it is
 * shown taller to keep the two wordmarks the same size.
 */
function BuiltOn() {
  return <div className="landing-built-on">
    <span className="landing-built-on-label">Built on</span>
    <span className="landing-built-on-item">
      <img className="logo-light built-on-hunyuan" src={hunyuanLockup} alt="Tencent Hunyuan" width={88} height={28} />
      <img className="logo-dark built-on-hunyuan" src={hunyuanLockupDark} alt="Tencent Hunyuan" width={88} height={28} />
      <span className="landing-built-on-caption">Hy3 model</span>
    </span>
    <span className="landing-built-on-divider" aria-hidden="true" />
    <span className="landing-built-on-item">
      <img className="logo-light built-on-cloud" src={cloudLockup} alt="Tencent Cloud" width={139} height={21} />
      <img className="logo-dark built-on-cloud-dark" src={cloudLockupDark} alt="Tencent Cloud" width={146} height={26} />
      <span className="landing-built-on-caption">Served on TokenHub</span>
    </span>
  </div>;
}

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
