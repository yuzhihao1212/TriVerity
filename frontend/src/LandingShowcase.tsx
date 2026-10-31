import { useEffect, useState, type CSSProperties } from "react";
import { HEARING_REPLAY, REPLAY_LENGTH, VALUE_MODEL, VALUE_RANGE, valueAt } from "./landingStory";
import { prefersReducedMotion } from "./routes";

const TICK_MS = 100;
const HOLD_S = 4; // the finished ruling stays up this long before the replay starts again

function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const change = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}

/**
 * The live D001 hearing, replayed: evidence, both advocates, the rules and the ruling, on a
 * running clock. Pauses while hovered or focused and on the pause button; under reduced
 * motion it shows the finished hearing and never moves.
 */
export function HeroConsole() {
  const reduced = useReducedMotion();
  const [time, setTime] = useState(0);
  const [held, setHeld] = useState(false);
  const [stopped, setStopped] = useState(false);
  const running = !reduced && !stopped && !held;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setTime(t => (t >= REPLAY_LENGTH + HOLD_S ? 0 : t + TICK_MS / 1000)), TICK_MS);
    return () => window.clearInterval(timer);
  }, [running]);
  const shown = reduced ? REPLAY_LENGTH : Math.min(time, REPLAY_LENGTH);
  const done = shown >= REPLAY_LENGTH;
  const current = HEARING_REPLAY.reduce((last, step, i) => (step.at <= shown ? i : last), -1);
  return <section className={`hero-console${done ? " is-done" : ""}`} aria-label="Replay of sample case D001"
    onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}
    onFocus={() => setHeld(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false); }}>
    <p className="sr-only">Sample case D001, a route dispute. The GPS check finds the route 44% longer and the trip 59% slower.
      The rider’s AI argues an unjustified detour under rule RD-3; the driver’s AI argues congestion. Under RD-3 the rules
      decide a partial refund of $6.30, 80% confident, in about 16 seconds.</p>
    <div className="hero-console-head" aria-hidden="true">
      <span className="hero-console-live"><span className="hero-console-pulse" />{done ? "Ruled" : "Live replay"}</span>
      <span>D001 · Route</span>
      <span className="hero-console-clock">{shown.toFixed(1).padStart(4, "0")} s</span>
    </div>
    <div className="hero-console-progress" aria-hidden="true"><span style={{ "--console-progress": shown / REPLAY_LENGTH } as CSSProperties} /></div>
    <ol className="hero-console-log" aria-hidden="true">{HEARING_REPLAY.map((step, i) =>
      <li key={step.who} className={`is-${step.kind}${step.at <= shown ? " is-on" : ""}${i === current && !done ? " is-current" : ""}`}>
        <span className="hero-console-who">{step.who}</span><span className="hero-console-text">{step.text}</span>
      </li>)}</ol>
    {!reduced && <button type="button" className="hero-console-pause" onClick={() => setStopped(s => !s)}
      aria-label={stopped ? "Play the Hearing Replay" : "Pause the Hearing Replay"}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        {stopped ? <path d="M8 5.5v13l10-6.5Z" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />}
      </svg>
    </button>}
  </section>;
}

/** Today's review time against TriVerity's, as two bars. */
export function BeforeAfter() {
  return <dl className="landing-before-after">
    <div className="is-before"><dt>Today, manual review</dt><dd><span className="landing-bar" aria-hidden="true" /><strong>24–72 h</strong></dd></div>
    <div className="is-after"><dt>With TriVerity</dt><dd><span className="landing-bar" aria-hidden="true" /><strong>16–18 s</strong></dd></div>
  </dl>;
}

/** The business-case model with the daily volume on a slider. */
export function SavingsCalculator() {
  const [disputes, setDisputes] = useState<number>(VALUE_MODEL.disputes);
  const stats = valueAt(disputes);
  return <div className="landing-calculator">
    <div className="landing-calculator-input">
      <label htmlFor="value-disputes">Disputes a day</label>
      <input id="value-disputes" type="range" min={VALUE_RANGE.min} max={VALUE_RANGE.max} step={VALUE_RANGE.step} value={disputes}
        aria-valuetext={`${disputes.toLocaleString("en-US")} disputes a day`} onChange={event => setDisputes(Number(event.target.value))} />
      <output htmlFor="value-disputes">{disputes.toLocaleString("en-US")}</output>
    </div>
    <dl className="landing-value">{stats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>
  </div>;
}
