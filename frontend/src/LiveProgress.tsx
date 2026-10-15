import { useEffect, useState } from "react";
import { Chip } from "./Chip";
import { SourceBadge } from "./Debate";
import { humanizeAgentMessage } from "./agentText";
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
    <div className="card-head"><div className="panel-head"><h2 id="loading-title" tabIndex={-1}>Agents working · {disputeId}</h2><Chip size="sm" tone="brand">{streaming ? "Live agent progress" : "Standard resolve"}</Chip></div>
      <p className="elapsed-time muted" aria-live="off">Elapsed <strong>{elapsed} s</strong></p></div>
    <p className="muted small">{streaming ? "Completed steps appear as the server reports them. Parallel agents may finish in a different order." : "Live progress is unavailable. Retrying once with the standard resolve; waiting for the complete result. Steps below belong to the interrupted stream."}</p>
    <p className="sr-only" role="status" aria-live="polite">{!streaming ? "Live progress unavailable. Retrying once with the standard resolve." : ""}</p>
    <ol className="live-timeline" role="list" aria-label="Completed agent steps">
      {steps.map(entry => {
        const source = stepSource(entry), time = duration(entry.duration_ms);
        return <li key={`${entry.step}-${entry.agent}`}>
          <div className="live-step-head"><span className="live-step-check" aria-hidden="true">✓</span><strong>{agentLabel(entry.agent)}</strong>
            {source === "llm" || source === "fallback" ? <SourceBadge source={source} /> : <Chip size="sm" tone="outline">{source === "code" ? "Code" : "Source not supplied"}</Chip>}
            {time && <span className="step-duration muted">{time}</span>}
          </div><p title={humanizeAgentMessage(entry.agent, stepMessage(entry)) || stepMessage(entry)}>{humanizeAgentMessage(entry.agent, stepMessage(entry)) || stepMessage(entry)}</p>
        </li>;
      })}
    </ol>
    <div className="live-pending"><span className="spinner" aria-hidden="true" /><p>{streaming ? "Still working…" : "Waiting for the complete result…"}</p></div>
    <p className="small muted">Previous saved results are retained until this run succeeds.</p>
  </section>;
}


// Keep this log mounted after the result switches to Evidence. Final step(s)
// and result often share a network chunk; unmounting their announcer would lose
// those announcements. The timer and visual timeline never update this log.
export function ProgressAnnouncements({ steps }: { steps: AgentLogEntry[] }) {
  return <div className="sr-only" role="log" aria-label="Live agent progress" aria-live="polite" aria-relevant="additions" aria-atomic="false">
    {steps.map(entry => {
      const source = stepSource(entry), time = duration(entry.duration_ms);
      const badge = source === "llm" ? "AI" : source === "fallback" ? "Fallback" : source === "code" ? "Code" : "";
      return <p key={`${entry.step}-${entry.agent}`}>{agentLabel(entry.agent)} completed. {badge}{time ? ` · ${time}` : ""}</p>;
    })}
  </div>;
}
