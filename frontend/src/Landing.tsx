import { useEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Chip } from "./Chip";
import { CASES } from "./landingCases";
import { Icon } from "./Icon";
import { HunyuanMark } from "./SourceBadge";
import { focusSection } from "./routes";
import { PresentationToggle, ThemeToggle } from "./ThemeToggle";
import type { Point, Theme } from "./theme";
import heroLarge from "./assets/hero-ride-1536.webp";
import heroSmall from "./assets/hero-ride-768.webp";
import problemLarge from "./assets/problem-rider-1400.webp";
import problemSmall from "./assets/problem-rider-760.webp";
import hunyuanLockup from "./assets/logos/tencent-hunyuan-lockup.webp";
import hunyuanLockupDark from "./assets/logos/tencent-hunyuan-lockup-dark.webp";
import cloudLockup from "./assets/logos/tencent-cloud.webp";
import cloudLockupDark from "./assets/logos/tencent-cloud-dark.webp";
import { OeroMark } from "./OeroAI";
import { LandingScrollNav, ScrollCue, sectionDomId } from "./LandingScrollNav";
import type { LandingSectionId } from "./landingNav";
import { BeforeAfter, HeroConsole, SavingsCalculator } from "./LandingShowcase";
import { AUTOMATION_RING, COINS, REPEAT_DOTS, RESULTS_BOX, SAMPLE_TICKS, SHIELD, STOPWATCH } from "./resultsVisuals";
import { CASE_VIEWS, ENGINEERING_PROOF, HEARING_ROUNDS, ROLLOUT } from "./landingStory";
import "./landingStory.css";

const GITHUB = "https://github.com/yuzhihao1212/TriVerity";
const DEMO_VIDEO = "https://www.youtube.com/watch?v=z3-8uuPBPAw";

// README.md (live sample evaluation, 16 Oct 2026), docs/simulation.md (offline, seed 7) and
// docs/security.md (live red-team runs). Keep the values and their measurement context together.
export const LANDING_RESULTS = [
  { value: "9/9", label: "Sample rulings correct", detail: "Live Hy3 evaluation, including the organisers’ case." },
  { value: "78%", label: "Resolved without a human", detail: "390 of 500 generated disputes, evaluated offline." },
  { value: "100/100", label: "Same facts, same ruling", detail: "Repeated rulings in the offline simulation." },
  { value: "16–18 s", label: "From evidence to ruling", detail: "Live Hy3 measurements, end to end." },
  { value: "$0.002", label: "AI cost per dispute", detail: "Live Hy3; about 10,000 tokens per dispute." },
  { value: "0/68", label: "Live injection runs that swayed a ruling", detail: "17 attacks on live Hy3; 23 tested offline." },
] as const;

// Three stages people can grasp at a glance; the six real steps sit under them as chips.
const STAGES = [
  { icon: "magnifier", verb: "Gather", rest: "the Evidence", line: "GPS · chat · fares · history", steps: [
    { title: "Evidence Collection", ai: true, code: true, detail: "Rules verify GPS, chat, fares and history; each advocate’s AI requests the records it needs." },
  ] },
  { icon: "bubbles", verb: "Argue", rest: "Both Sides", line: "Rider AI vs driver AI, one reply each", steps: [
    { title: "Advocates", ai: true, detail: "Each side builds its case from the same verified evidence." },
    { title: "Rebuttal", ai: true, detail: "Each advocate answers the other side once." },
  ] },
  { icon: "scales", verb: "Decide", rest: "Fairly", line: "Rules Decide, AI Explains", steps: [
    { title: "Fraud & Precedent Checks", code: true, detail: "Rules check bad-faith signals and retrieve similar past rulings." },
    { title: "Policy Rules", code: true, detail: "A refund, compensation or no action, with confidence; uncertain or risky cases go to a human." },
    { title: "Judge Explains", ai: true, detail: "AI explains the ruling and prepares a separate message for each party." },
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
  { icon: "scales", title: "Rules Decide, AI Explains", proof: "No AI in the decision", detail: "Decisions and amounts come from fixed rules. The same facts produce the same ruling, whoever argues the case." },
  { icon: "magnifier", title: "Every Argument Fact-checked", detail: "Every argument cites evidence and policy rules, and the Judge checks each cited rule against the facts: it holds for that side, favours the other, or doesn't apply." },
  { icon: "person", title: "Fair to Both Sides", proof: "500/500 fairness checks", detail: "Party history never changed a policy ruling: 500 of 500 simulated disputes got the same decision with histories removed or swapped. History is only used to check for bad-faith patterns." },
  { icon: "shield", title: "Humans for Risky Cases", proof: "Safety cases come first", detail: "Uncertain or high-risk cases go to a human reviewer with a priority tier. Safety cases come first." },
  { icon: "books", title: "Appeals Teach the System", detail: "A reviewer's appeal decision becomes a precedent for similar future cases.", note: "Needs a judge access code in the public demo." },
  { icon: "lock", title: "Tested Against Prompt Injection", proof: "0 of 68 live runs swayed", detail: "23 attack scenarios tested offline. Across 17 attacks and 68 live Hy3 runs, no injection changed a ruling." },
];

export function Landing({ presentation, onTogglePresentation, theme, onToggleTheme, onOpenConsole }: {
  presentation: boolean; onTogglePresentation: () => void; theme: Theme; onToggleTheme: (origin: Point | null) => void;
  /** CTA click handler: plays the console intro on a plain left-click, otherwise leaves the link alone. */
  onOpenConsole?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const resultsRef = useResultsAnimation();
  return <div className={`landing${presentation ? " presentation-mode" : ""}`}>
    <a className="skip-link" href="#landing-main" onClick={event => { event.preventDefault(); focusSection("landing-main"); }}>Skip to content</a>
    <header className="landing-header">
      <div className="landing-wrap landing-nav">
        <nav aria-label="Project"><a href={`${GITHUB}#readme`}>Project Docs</a>
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
          <p className="landing-lead"><span>Ride disputes resolved fairly</span> <span>in seconds, not days.</span></p>
          <p className="landing-intro muted">AI agents argue both sides; policy rules decide fairly. Follow the evidence and see why each ruling holds.</p>
          <div className="landing-actions"><a className="landing-primary" href="#/console" onClick={onOpenConsole}>Open the Reviewer Console <span aria-hidden="true">↗</span></a>
            <a href={DEMO_VIDEO}>Watch the Demo Video <span aria-hidden="true">↗</span></a>
            <a href={GITHUB}>View the Source on GitHub <span aria-hidden="true">↗</span></a></div>
          <BuiltOn />
          </div>
          <HeroVisual />
        </div>
        <ScrollCue />
      </section>
      <div className="landing-wrap landing-sections">
        <section ref={resultsRef} className="landing-results" id="section-results" tabIndex={-1} aria-labelledby="results-title">
          <div className="landing-section-head"><p className="eyebrow">Measured results</p><h2 id="results-title">Small sample. Clear benchmarks.</h2></div>
          <dl className="landing-metrics">{LANDING_RESULTS.map((result, index) => <div key={result.label} style={{ "--results-delay": `${index * 120}ms` } as CSSProperties}>
            <dt>{result.label}</dt>
            <dd className="landing-result-visual" aria-hidden="true"><ResultVisual index={index} /></dd>
            <dd className="landing-metric-value">{result.value}</dd><dd className="landing-metric-detail">{result.detail}</dd>
            {index === 1 && <dd className="landing-result-caption">22% go to a human reviewer</dd>}
            {index === 3 && <dd className="landing-result-caption">vs <strong>24–72 h</strong> today (Ryde's brief)</dd>}
          </div>)}</dl>
          <p className="landing-footnote muted">Synthetic data, not production results. Sample accuracy, latency and cost come from live Hy3 measurements; automation and repeatability come from the offline simulation; injection results from live red-team runs. <a href={`${GITHUB}/blob/main/docs/evaluation.md`}>Evaluation</a> · <a href={`${GITHUB}/blob/main/docs/simulation.md`}>500-dispute simulation</a> · <a href={`${GITHUB}/blob/main/docs/security.md`}>Security</a></p>
        </section>
        <Chapter id="problem" number={1} label="The problem" title="A disputed $4 fee shouldn’t take up to three days."
          lead={<>Reviewers piece together GPS, chat, fares and history by hand, and rulings vary with who reviews. Ryde’s brief puts a resolution at <strong>24–72 hours</strong>.</>}
          visual={<ProblemVisual />}>
          <BeforeAfter />
        </Chapter>

        <Chapter id="flow" number={2} label="How it works" title="Two AIs argue. The rules decide." flip
          lead="AI handles the language: gathering records and making each side’s case. Fixed policy rules check the facts and set every outcome and amount."
          visual={<StageFlow />} body={<HearingExcerpt />} />

        <Chapter id="views" number={3} label="Who it serves" title="One ruling, told three ways."
          lead="The rider, the driver and the reviewer each see what they need. Fraud signals, party history and internal evidence IDs never reach the rider or driver."
          visual={<div className="chapter-views">{CASE_VIEWS.map(view => <article className="chapter-view" key={view.role}>
            <p className="chapter-view-role"><Icon name={view.icon} />{view.role}<span>{view.status}</span></p>
            <p className="chapter-view-line">{view.line}</p>
          </article>)}</div>} />

        <Chapter id="trust" number={4} label="Trust" title="Every ruling can be questioned." flip
          lead="Rules make the decision, every argument is fact-checked, and risky cases go to a person, who has the final say."
          visual={<TrustList />}
          body={<div className="chapter-governance">
            <p><strong>Mapped to Singapore’s AI governance guidance:</strong> AI Verify principles, the Model AI Governance Framework and the PDPA. A self-assessment of a prototype on synthetic data, not a certification or legal advice. <a href={`${GITHUB}/blob/main/docs/responsible-ai.md`}>Responsible AI Scorecard</a></p>
            <p><strong>Known limits:</strong> synthetic data only, two dispute types and English-only party messages. Chat analysis is keyword-based. <a href={`${GITHUB}/blob/main/docs/system-card.md`}>System Card</a></p>
          </div>} />

        <Chapter id="rollout" number={5} label="Rollout and value" title="Start in shadow mode. Scale when it agrees."
          lead="It runs beside the current team with no customer impact, then widens as agreement with reviewers holds."
          visual={<ol className="chapter-rollout">{ROLLOUT.map(step => <li key={step.title}>
            <h3>{step.title}<span>{step.time}</span></h3>
            <p>{step.detail}</p>
          </li>)}</ol>}
          body={<>
            <SavingsCalculator />
            <p className="landing-note">An illustrative model: 78% automated, 5–15 minutes a review and $20–30 an hour, starting at 5,000 disputes a day. The volume, review time and hourly cost are our assumptions, not Ryde’s. <a href={`${GITHUB}/blob/main/docs/business-case.md`}>Business case</a></p>
          </>} />

        <Chapter id="proof" number={6} label="Under the hood" title="Built to be checked." flip
          lead="Every AI reply is validated before anyone sees it, and every change went through a pull request, automated tests and CI."
          visual={<dl className="landing-proof">{ENGINEERING_PROOF.map(item => <div key={item.label}>
            <dt>{item.label}</dt>
            <dd className="landing-proof-value">{item.value}</dd>
            <dd className="landing-proof-detail">{item.detail}</dd>
          </div>)}</dl>}
          body={<>
            <p className="landing-proof-links"><a href={`${GITHUB}/blob/main/docs/architecture.md`}>Architecture Diagram</a><a href={`${GITHUB}/blob/main/docs/security.md`}>Security</a><a href={`${GITHUB}/blob/main/docs/api-contract.md`}>API Contract</a></p>
            <p className="landing-note">Developed with Tencent Cloud CodeBuddy and WorkBuddy. The AI coding assistants Claude Code, OpenAI Codex and Kiro also helped build and review features. <a href={`${GITHUB}#built-with`}>How we built it</a></p>
          </>} />

        <Chapter id="try" number={7} label="Try it" title="Open a case. Follow the reasoning."
          lead="Opening a case loads its evidence. Agents run only when you press “Run agents”."
          body={<div className="landing-cases">{CASES.map(sample => <a className="landing-case" key={sample.id} href={sample.href} aria-label={sample.accessibleName}>
            <span className={`landing-case-icon${sample.tone === "warn" ? " warn" : ""}`} aria-hidden="true"><Icon name={sample.icon} /></span>
            <h3>{sample.title}</h3>
            <div className="chip-row landing-case-evidence">{sample.evidence.map(line => <Chip key={line} size="sm" tone="outline">{line}</Chip>)}</div>
            <p className={`landing-case-outcome tone-${sample.tone}`}><span className="landing-case-dot" aria-hidden="true" /><strong>{sample.outcome}</strong></p>
            <span className="landing-case-footer"><span className="landing-case-id">{sample.id}</span><span aria-hidden="true">·</span><span className="landing-case-action">Open case <span aria-hidden="true">→</span></span></span>
          </a>)}</div>} />
      </div>
    </main>
    <LandingScrollNav />
    <footer className="landing-footer"><div className="landing-wrap"><div><strong>TriVerity</strong> <span className="byline">By OeroAI</span><p className="muted">a hackathon prototype</p></div>
      <nav aria-label="Documentation"><a href={`${GITHUB}/blob/main/docs/architecture.md`}>Architecture</a><a href={`${GITHUB}/blob/main/docs/security.md`}>Security</a><a href={`${GITHUB}/blob/main/docs/evaluation.md`}>Evaluation</a><a href={`${GITHUB}/blob/main/docs/responsible-ai.md`}>Responsible AI</a><a href={`${GITHUB}/blob/main/docs/system-card.md`}>System Card</a><a href={`${GITHUB}/blob/main/docs/business-case.md`}>Business Case</a></nav>
    </div>
    <div className="landing-wrap landing-legal">
      <p>Built for Ryde’s challenge at the Tencent Cloud AI Hackathon Singapore 2026. Not affiliated with or endorsed by Ryde.</p>
      <p>© 2026 OeroAI. All rights reserved.</p>
    </div></footer>
  </div>;
}

/**
 * One chapter of the story below the hero: a numbered label, one headline, one line, one
 * visual beside them (sides alternate with `flip`), and anything longer full width beneath.
 */
function Chapter({ id, number, label, title, lead, visual, body, flip, children }: {
  id: LandingSectionId; number: number; label: string; title: string; lead: ReactNode;
  visual?: ReactNode; body?: ReactNode; flip?: boolean; children?: ReactNode;
}) {
  const titleId = `${id}-title`;
  return <section className={`chapter${number % 2 ? " is-tinted" : ""}${flip ? " is-flipped" : ""}${visual ? "" : " is-text-only"}`} id={sectionDomId(id)} tabIndex={-1} aria-labelledby={titleId}>
    <div className="chapter-text">
      <p className="chapter-label"><span className="chapter-number">{String(number).padStart(2, "0")}</span>{label}</p>
      <h2 id={titleId}>{title}</h2>
      <p className="chapter-lead">{lead}</p>
      {children}
    </div>
    {visual && <div className="chapter-visual">{visual}</div>}
    {body && <div className="chapter-body">{body}</div>}
  </section>;
}

/** The three stages as one column: what happens, and whether AI or rules do it. */
function StageFlow() {
  return <ol className="chapter-stages">{STAGES.map((stage, index) => <li key={stage.verb}>
    <span className="landing-stage-icon" aria-hidden="true"><Icon name={stage.icon} /></span>
    <div>
      <h3><span className="sr-only">Stage {index + 1}: </span><span className="landing-stage-verb">{stage.verb}</span> {stage.rest}</h3>
      <p>{stage.line}</p>
      <ul className="chip-row" aria-label={`Steps in ${stage.verb}`}>{stage.steps.map(step => <li key={step.title}>
        <Chip size="sm" tone={"ai" in step ? "ai" : "neutral"} icon={"ai" in step ? undefined : "function"} title={step.detail}>
          {"ai" in step && <HunyuanMark />}
          {step.title}{"ai" in step && "code" in step && " · AI + rules"}<span className="sr-only">{"ai" in step ? ", Hunyuan AI" : ", rules"}</span>
        </Chip>
      </li>)}</ul>
    </div>
  </li>)}</ol>;
}

/** The six safeguards as a list; each opens in place to say how it holds. */
function TrustList() {
  return <ul className="chapter-trust">{TRUST_TILES.map(tile => <li key={tile.icon}>
    <details>
      <summary><span className="landing-stage-icon" aria-hidden="true"><Icon name={tile.icon} /></span>
        <span className="chapter-trust-title">{tile.title}{tile.proof && <span className="chapter-trust-proof">{tile.proof}</span>}</span></summary>
      <p>{tile.detail}{tile.note && <span className="chapter-trust-note">{tile.note}</span>}</p>
    </details>
  </li>)}</ul>;
}

/** What the agents actually said on one case, then what the rules did with it. */
function HearingExcerpt() {
  const [first, ...rest] = HEARING_ROUNDS;
  const round = (r: { title: string; rider: string; driver: string }) => <div className="landing-hearing-round" key={r.title}>
    <h4>{r.title}</h4>
    <div className="landing-hearing-sides">
      <figure className="landing-hearing-side"><figcaption><Icon name="person" />For the Rider <Chip size="sm" tone="ai"><HunyuanMark />AI</Chip></figcaption><blockquote>{r.rider}</blockquote></figure>
      <figure className="landing-hearing-side"><figcaption><Icon name="wheel" />For the Driver <Chip size="sm" tone="ai"><HunyuanMark />AI</Chip></figcaption><blockquote>{r.driver}</blockquote></figure>
    </div>
  </div>;
  return <div className="landing-hearing">
    <div className="landing-hearing-head"><h3>From a Real Hearing</h3><p>Excerpts from a live Hy3 run on sample case D001.</p></div>
    {round(first)}
    {rest.length > 0 && <details className="landing-hearing-more"><summary>Read how each side replied</summary>{rest.map(round)}</details>}
    <div className="landing-hearing-ruling">
      <Icon name="scales" />
      <div><strong>The rules decide: partial refund $6.30</strong>
        <p>The route was 44% longer and took 59% longer, so the detour did not save time. Neither advocate sets the outcome.</p></div>
      <a href="#/console/D001">Open This Case <span aria-hidden="true">→</span></a>
    </div>
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
  if (index === 4) return <svg viewBox={`0 0 ${RESULTS_BOX} ${RESULTS_BOX}`} aria-hidden="true" focusable="false">
    {COINS.map((coin, i) => <g key={i} className="results-pop" style={{ "--results-item-delay": `${i * 90}ms` } as CSSProperties}>
      <circle className="results-coin" cx={coin.x} cy={coin.y} r={coin.radius} />
      <circle className="results-coin-rim" cx={coin.x} cy={coin.y} r={coin.radius - 5} />
      {i === COINS.length - 1 && <text className="results-coin-mark" x={coin.x} y={coin.y} textAnchor="middle" dominantBaseline="central">$</text>}
    </g>)}
  </svg>;
  if (index === 5) return <svg viewBox={`0 0 ${RESULTS_BOX} ${RESULTS_BOX}`} aria-hidden="true" focusable="false">
    <path className="results-shield" d={SHIELD.outline} />
    <path className="results-pop" style={{ "--results-item-delay": "200ms" } as CSSProperties} d={SHIELD.tick} />
  </svg>;
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
    <HeroConsole />
  </figure>;
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
