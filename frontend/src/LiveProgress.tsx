import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Chip } from "./Chip";
import { SourceBadge } from "./SourceBadge";
import { Icon } from "./Icon";
import { AgentRunningLoader, FlatLoader, useLoaderVisible } from "./OeroAI";
import { humanizeAgentMessage } from "./agentText";
import { duration, stepMessage, stepSource } from "./progress";
import { AGENT_ORDER, isFinished, nearLatest, progressEstimate, progressName, type FinishedTimes } from "./progressEstimate";
import { agentLabel } from "./workflow";
import { prefersReducedMotion } from "./routes";
import type { AgentLogEntry } from "./types";

/**
 * A run in progress, then its completion card. The estimate, fill and labels come from
 * progressEstimate.ts. While the reviewer is at the bottom of the page the view follows the
 * newest result; scrolling up pauses that until "Jump to latest".
 */
export function LiveProgress({ disputeId, steps, startedAt, finishedAt = {}, endedAt = null, streaming, onReviewEvidence }: {
  disputeId: string; steps: AgentLogEntry[]; startedAt: number; finishedAt?: FinishedTimes;
  endedAt?: number | null; streaming: boolean; onReviewEvidence?: () => void;
}) {
  const complete = endedAt != null;
  const [elapsed, setElapsed] = useState(() => Math.max(0, (performance.now() - startedAt) / 1000));
  const previousRemaining = useRef<number>();
  const list = useRef<HTMLOListElement>(null);
  const completionHeading = useRef<HTMLHeadingElement>(null);
  const programmatic = useRef(false);
  const [follow, setFollow] = useState(true);

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
  // The flat OeroAI loader covers only the wait for the first agent event; then the progress bar takes over.
  const connectingLoader = useLoaderVisible(!complete && streaming && steps.length === 0);

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

  function jumpToLatest() {
    const last = list.current?.lastElementChild as HTMLElement | null | undefined;
    if (!last) return;
    setFollow(true);
    programmatic.current = true;
    last.scrollIntoView({ block: "end", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    window.setTimeout(() => { programmatic.current = false; }, prefersReducedMotion() ? 0 : 600);
  }
  // A new result or placeholder changes the list; keep it in view while following.
  useLayoutEffect(() => {
    if (!complete && follow) jumpToLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length, view.running.length, complete]);

  // Focus moves to the completion heading once, so screen readers announce it.
  useEffect(() => {
    if (!complete) return;
    const heading = completionHeading.current;
    heading?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    heading?.focus({ preventScroll: true });
  }, [complete]);

  const entries = new Map(steps.filter(isFinished).map(entry => [entry.agent, entry]));
  const visibleAgents = [...AGENT_ORDER.filter(agent => entries.has(agent) || view.running.includes(agent)),
    ...[...entries.keys()].filter(agent => !AGENT_ORDER.some(known => known === agent))];
  return <section className="card loading-state live-progress" aria-labelledby={complete ? "live-completed-title" : "loading-title"}>
    {complete ? <div className="live-completion">
      <h2 ref={completionHeading} id="live-completed-title" tabIndex={-1}><Icon name="check" />{view.completionText}</h2>
      <button type="button" className="run-button" onClick={onReviewEvidence}>Review the evidence →</button>
    </div> : <div className="card-head"><div className="panel-head"><h2 id="loading-title" tabIndex={-1}>Agents working · {disputeId}</h2>
      <Chip size="sm" tone="brand">{streaming ? "Live agent progress" : "Standard resolve"}</Chip></div></div>}
    <div className={`live-progress-head${complete ? " complete" : ""}`}>
      <div className="live-progress-summary"><strong>{view.count}</strong><span aria-live="off">{view.estimate}</span></div>
      <div className="live-progress-track" role="progressbar" aria-label="Agents progress" aria-valuemin={0} aria-valuemax={9} aria-valuenow={view.done}>
        <span className={`live-progress-fill${complete || view.fill === 100 ? " complete" : ""}`} style={{ width: `${view.fill}%` }} />
      </div>
      <p className="live-running" aria-live="off">{connectingLoader && <FlatLoader className="button-loader" />}{view.runningLabel}</p>
    </div>
    {!complete && <p className="muted small">{streaming
      ? "Results appear as each agent finishes. Times are estimates from typical runs; parallel agents may finish in a different order."
      : "Live progress is unavailable. Retrying once with the standard resolve; waiting for the complete result. Steps below belong to the interrupted stream."}</p>}
    <p className="sr-only" role="status" aria-live="polite">{!streaming && !complete ? "Live progress unavailable. Retrying once with the standard resolve." : ""}</p>
    <ol ref={list} className="live-timeline" role="list" aria-label="Agent progress">
      {visibleAgents.map(agent => {
        const entry = entries.get(agent);
        if (!entry) return <li key={agent} className="live-placeholder">
          <div className="live-step-head"><AgentRunningLoader /><strong>{progressName(agent)}</strong><span className="muted">working…</span></div>
          <span className="live-shimmer" aria-hidden="true" />
        </li>;
        const source = stepSource(entry), time = duration(entry.duration_ms);
        // Evidence first: the progress panel never reveals the Judge's outcome.
        const message = agent === "judge" ? "Ruling and explanations are ready for review."
          : agent === "precedent_agent" ? "Relevant past rulings were checked."
            : humanizeAgentMessage(entry.agent, stepMessage(entry)) || stepMessage(entry);
        return <li key={agent}>
          <div className="live-step-head"><span className="live-step-check" aria-hidden="true">✓</span><strong>{progressName(agent)}</strong>
            {source === "llm" || source === "fallback" || source === "code" ? <SourceBadge source={source} /> : <Chip size="sm" tone="outline">Source not supplied</Chip>}
            {time && <span className="step-duration muted">{time}</span>}
          </div><p title={message}>{message}</p>
        </li>;
      })}
    </ol>
    {!complete && !follow && <button type="button" className="secondary-button live-jump" onClick={jumpToLatest}>Jump to latest ↓</button>}
    {!complete && <p className="small muted">Previous saved results are retained until this run succeeds.</p>}
  </section>;
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
