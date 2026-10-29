import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Chip } from "./Chip";
import { SourceBadge } from "./SourceBadge";
import { Icon } from "./Icon";
import { AgentRunningLoader, FlatLoader, useLoaderVisible } from "./OeroAI";
import { agentLineParts } from "./agentDisplay";
import { humanizeAgentMessage } from "./agentText";
import { bottomLine } from "./hearingDisplay";
import { liveHeadline, liveStages, type LiveStage } from "./liveStages";
import { duration, stepMessage, stepSource } from "./progress";
import { AGENT_ORDER, isFinished, nearLatest, progressEstimate, progressName, type FinishedTimes } from "./progressEstimate";
import { agentLabel } from "./workflow";
import { prefersReducedMotion } from "./routes";
import type { AgentLogEntry } from "./types";

const SIDES: Record<string, { name: string; working: string }> = {
  rider_advocate: { name: "Rider", working: "Writing the rider's argument…" },
  driver_advocate: { name: "Driver", working: "Writing the driver's argument…" },
  rider_rebuttal: { name: "Rider's reply", working: "Answering the driver…" },
  driver_rebuttal: { name: "Driver's reply", working: "Answering the rider…" },
};

/**
 * A run in progress, then its completion card: four stages on a rail (liveStages.ts) under a
 * pinned headline and progress bar (progressEstimate.ts). While following, the view scrolls only
 * when the active stage changes, so parallel agents finishing never make it twitch; scrolling up
 * pauses that until "Back to live" or the reviewer returns to the bottom.
 */
export function LiveProgress({ disputeId, steps, startedAt, finishedAt = {}, endedAt = null, streaming, onReviewEvidence }: {
  disputeId: string; steps: AgentLogEntry[]; startedAt: number; finishedAt?: FinishedTimes;
  endedAt?: number | null; streaming: boolean; onReviewEvidence?: () => void;
}) {
  const complete = endedAt != null;
  const [elapsed, setElapsed] = useState(() => Math.max(0, (performance.now() - startedAt) / 1000));
  const previousRemaining = useRef<number>();
  const head = useRef<HTMLDivElement>(null);
  const activeStage = useRef<HTMLLIElement>(null);
  const completionHeading = useRef<HTMLHeadingElement>(null);
  const programmatic = useRef(false);
  const [follow, setFollow] = useState(true);
  const [headHeight, setHeadHeight] = useState(0);

  useEffect(() => {
    if (complete) return;
    const tick = () => setElapsed(Math.max(0, (performance.now() - startedAt) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, complete]);

  const view = progressEstimate({ steps, finishedAt, elapsed: complete ? (endedAt - startedAt) / 1000 : elapsed,
    previousRemaining: previousRemaining.current, complete, streaming });
  useEffect(() => { previousRemaining.current = view.remaining; }, [view.remaining]);
  const connecting = !complete && streaming && steps.length === 0;
  // The flat OeroAI loader covers only the wait for the first agent event; then the progress bar takes over.
  const connectingLoader = useLoaderVisible(connecting);

  const entries = new Map(steps.filter(isFinished).map(entry => [entry.agent, entry]));
  const stages = liveStages({ finished: new Set(entries.keys()), running: view.running, finishedAt });
  const activeIndex = complete ? -1 : stages.findIndex(stage => stage.state === "active");
  // Agents outside the known stages stay visible, after the rail.
  const others = [...entries.values()].filter(entry => !AGENT_ORDER.some(known => known === entry.agent));

  // Only the reviewer scrolling up pauses following (the app's own scrolls never do);
  // reaching the bottom again resumes it.
  useEffect(() => {
    if (complete) return;
    let touchY: number | null = null;
    const pause = () => setFollow(false);
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) pause(); };
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? null; };
    const onTouchMove = (event: TouchEvent) => { if (touchY != null && (event.touches[0]?.clientY ?? 0) > touchY + 10) pause(); };
    const onKey = (event: KeyboardEvent) => { if (["ArrowUp", "PageUp", "Home"].includes(event.key)) pause(); };
    const onScroll = () => {
      if (programmatic.current) return;
      const doc = document.documentElement;
      if (nearLatest(doc.scrollHeight, window.innerHeight, window.scrollY)) setFollow(true);
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, [complete]);

  // The pinned head covers the top of the window, so stages scroll in below it.
  useLayoutEffect(() => {
    const box = head.current;
    if (!box) return;
    const measure = () => setHeadHeight(box.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  /** Bring the active stage fully into view; nothing moves if it already is. */
  function showActive() {
    const target = activeStage.current;
    if (!target) return;
    programmatic.current = true;
    target.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    window.setTimeout(() => { programmatic.current = false; }, prefersReducedMotion() ? 0 : 600);
  }
  function backToLive() {
    setFollow(true);
    showActive();
  }
  // Follow the active stage, not every agent event: parallel agents finish milliseconds apart.
  useEffect(() => {
    if (complete || !follow || activeIndex < 0) return;
    const frame = requestAnimationFrame(showActive);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, complete]);

  // Focus moves to the completion heading once, so screen readers announce it.
  useEffect(() => {
    if (!complete) return;
    const heading = completionHeading.current;
    heading?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    heading?.focus({ preventScroll: true });
  }, [complete]);

  return <section className="card loading-state live-progress" aria-labelledby={complete ? "live-completed-title" : "loading-title"}
    style={{ "--live-head": `${headHeight}px` } as CSSProperties}>
    {complete ? <div className="live-completion">
      <h2 ref={completionHeading} id="live-completed-title" tabIndex={-1}><Icon name="check" />{view.completionText}</h2>
      <button type="button" className="run-button" onClick={onReviewEvidence}>Review the evidence →</button>
    </div> : <div className="card-head"><div className="panel-head"><h2 id="loading-title" tabIndex={-1}>Agents working · {disputeId}</h2>
      <Chip size="sm" tone="brand">{streaming ? "Live agent progress" : "Standard resolve"}</Chip></div></div>}
    <div ref={head} className={`live-progress-head${complete ? " complete" : ""}`}>
      <div className="live-progress-summary">
        <strong className="live-headline">{connectingLoader && <FlatLoader className="button-loader" />}{liveHeadline(stages, { complete, connecting })}</strong>
        <span aria-live="off">{view.estimate}</span>
      </div>
      <div className="live-progress-track" role="progressbar" aria-label="Agents progress" aria-valuemin={0} aria-valuemax={9} aria-valuenow={view.done}>
        <span className={`live-progress-fill${complete || view.fill === 100 ? " complete" : ""}`} style={{ width: `${view.fill}%` }} />
      </div>
      <p className="live-running" aria-live="off">{view.count}{!complete && !connecting && ` · ${view.runningLabel}`}</p>
    </div>
    {!complete && !streaming && <p className="muted small">Live progress is unavailable. Retrying once with the standard resolve; waiting for the complete result. Steps below belong to the interrupted stream.</p>}
    <p className="sr-only" role="status" aria-live="polite">{!streaming && !complete ? "Live progress unavailable. Retrying once with the standard resolve." : ""}</p>
    <ol className="live-rail" aria-label="Agent progress">
      {stages.map((stage, index) => <li key={stage.id} ref={index === activeIndex ? activeStage : undefined}
        className={`live-stage ${stage.state}`} aria-current={index === activeIndex ? "step" : undefined}>
        <span className="live-stage-marker" aria-hidden="true">
          {stage.state === "done" ? <span className="live-stage-done"><Icon name="check" /></span>
            : stage.state === "active" ? <AgentRunningLoader /> : <span className="live-stage-dot" />}
        </span>
        <div className="live-stage-body">
          <div className="live-stage-head">
            <h3>{stage.title}<span className="sr-only">{stage.state === "done" ? ", done" : stage.state === "active" ? ", in progress" : ", waiting"}</span></h3>
            {stage.time && <span className="live-stage-time">{stage.time}</span>}
          </div>
          {stage.state !== "pending" && <StageContent stage={stage} entries={entries} running={view.running} />}
        </div>
      </li>)}
    </ol>
    {others.length > 0 && <ul className="live-lines live-others" aria-label="Other steps">
      {others.map(entry => <li key={entry.agent}><span>{progressName(entry.agent)}: {humanizeAgentMessage(entry.agent, stepMessage(entry)) || stepMessage(entry)}</span></li>)}
    </ul>}
    {!complete && !follow && <button type="button" className="secondary-button live-jump" onClick={backToLive}>Back to live ↓</button>}
    {!complete && <p className="small muted">Previous saved results are retained until this run succeeds. Times are estimates from typical runs.</p>}
  </section>;
}

/** A stage's agents: the two sides next to each other, everything else as one-line results. */
function StageContent({ stage, entries, running }: { stage: LiveStage; entries: Map<string, AgentLogEntry>; running: readonly string[] }) {
  const sides = stage.agents.filter(agent => agent in SIDES);
  const lines = stage.agents.filter(agent => !(agent in SIDES) && (entries.has(agent) || running.includes(agent)));
  return <>
    {sides.length > 0 && <div className="live-sides">{sides.map(agent => {
      const entry = entries.get(agent);
      if (!entry) return <div key={agent} className="live-side working">
        <span className="live-side-name">{SIDES[agent].name}</span>
        <p className="muted">{running.includes(agent) ? SIDES[agent].working : "Waiting to start"}</p>
        {running.includes(agent) && <span className="live-shimmer" aria-hidden="true" />}
      </div>;
      const source = stepSource(entry), time = duration(entry.duration_ms);
      // The advocate's own first sentence: real text, never rewritten.
      const text = bottomLine(humanizeAgentMessage(entry.agent, stepMessage(entry)) || stepMessage(entry)).first;
      return <div key={agent} className="live-side">
        <span className="live-side-name">{SIDES[agent].name}
          {source === "llm" || source === "fallback" ? <SourceBadge source={source} /> : null}
          {time && <span className="live-time">{time}</span>}</span>
        <p title={text}>{entry.status === "skipped" ? "This step was not run." : text}</p>
      </div>;
    })}</div>}
    {lines.length > 0 && <ul className="live-lines">{lines.map(agent => {
      const entry = entries.get(agent);
      if (!entry) return <li key={agent} className="working"><span className="muted">{progressName(agent)} working…</span></li>;
      const { action, source, time } = agentLineParts(entry);
      // Evidence first: the judge's and precedent lines never reveal the outcome.
      const detail = agent === "fraud_detector" ? humanizeAgentMessage(entry.agent, stepMessage(entry)) : null;
      return <li key={agent}>
        <span>{action}{detail && <span className="muted"> · {detail}</span>}</span>
        {source ? <SourceBadge source={source} /> : <span />}
        <span className="live-time">{time}</span>
      </li>;
    })}</ul>}
  </>;
}

// Keep this log mounted after the run so final steps that arrive with the result are still
// announced. The estimate timer and the visual timeline never update it.
export function ProgressAnnouncements({ steps }: { steps: AgentLogEntry[] }) {
  return <div className="sr-only" role="log" aria-label="Live agent progress" aria-live="polite" aria-relevant="additions" aria-atomic="false">
    {steps.filter(isFinished).map(entry => {
      const source = stepSource(entry), time = duration(entry.duration_ms);
      const badge = source === "llm" ? "AI" : source === "fallback" ? "Fallback" : source === "code" ? "Rules" : "";
      return <p key={`${entry.step}-${entry.agent}`}>{agentLabel(entry.agent)} completed. {badge}{time ? ` · ${time}` : ""}</p>;
    })}
  </div>;
}
