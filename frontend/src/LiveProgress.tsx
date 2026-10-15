import { useEffect, useState } from "react";
import { SourceBadge } from "./Debate";
import { duration, stepMessage, stepSource } from "./progress";
import { agentLabel } from "./workflow";
import type { AgentLogEntry } from "./types";

export function LiveProgress({ disputeId, steps, startedAt, streaming }: {
  disputeId: string; steps: AgentLogEntry[]; startedAt: number; streaming: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor((performance.now() - startedAt) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return <section className="card loading-state live-progress" aria-labelledby="loading-title">
    <div className="card-head"><div><p className="eyebrow">{streaming ? "Live agent progress" : "Standard resolve"}</p><h2 id="loading-title" tabIndex={-1}>Agents working · {disputeId}</h2></div>
      <p className="elapsed-time muted" aria-live="off">Elapsed <strong>{elapsed} s</strong></p></div>
    <p className="muted small">{streaming ? "Each step appears when it finishes. Parallel agents may finish in a different order." : "Live progress is unavailable. Retrying once with the standard resolve; waiting for the complete result."}</p>
    <ol className="live-timeline" role="log" aria-label="Completed agent steps" aria-live="polite" aria-relevant="additions" aria-atomic="false">
      {steps.map(entry => {
        const source = stepSource(entry), time = duration(entry.duration_ms);
        return <li key={`${entry.step}-${entry.agent}`}>
          <div className="live-step-head"><span className="live-step-check" aria-hidden="true">✓</span><strong>{agentLabel(entry.agent)}</strong>
            {source === "llm" || source === "fallback" ? <SourceBadge source={source} /> : <span className="tag">{source === "code" ? "Code" : "Source not supplied"}</span>}
            {time && <span className="step-duration muted">{time}</span>}
          </div><p>{stepMessage(entry)}</p>
        </li>;
      })}
    </ol>
    <div className="live-pending"><span className="spinner" aria-hidden="true" /><p>{streaming ? "Still working…" : "Waiting for the complete result…"}</p></div>
    <p className="small muted">Previous saved results are retained until this run succeeds.</p>
  </section>;
}
