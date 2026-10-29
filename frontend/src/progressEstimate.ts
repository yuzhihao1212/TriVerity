import type { AgentLogEntry } from "./types";

/** Typical seconds measured in live runs; parallel stages use their longest member. */
export const AGENT_TYPICAL_SECONDS = {
  evidence_loader: 0.2, evidence_collector: 4.8, fraud_detector: 0.1,
  rider_advocate: 3.0, driver_advocate: 3.3, rider_rebuttal: 2.7,
  driver_rebuttal: 3.1, precedent_agent: 1.2, judge: 4.4,
} as const;
export type ProgressAgent = keyof typeof AGENT_TYPICAL_SECONDS;
export const AGENT_ORDER = Object.keys(AGENT_TYPICAL_SECONDS) as ProgressAgent[];
export const AGENT_STAGES: readonly (readonly ProgressAgent[])[] = [
  ["evidence_loader"], ["evidence_collector"], ["fraud_detector", "rider_advocate", "driver_advocate"],
  ["rider_rebuttal", "driver_rebuttal"], ["precedent_agent"], ["judge"],
];
export const PROGRESS_NAMES: Record<ProgressAgent, string> = {
  evidence_loader: "Evidence loader", evidence_collector: "Evidence collector", fraud_detector: "Fraud detector",
  rider_advocate: "Rider advocate", driver_advocate: "Driver advocate", rider_rebuttal: "Rider reply",
  driver_rebuttal: "Driver reply", precedent_agent: "Precedent agent", judge: "Judge",
};
export type FinishedTimes = Partial<Record<ProgressAgent, number>>;
const seconds = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
export function isFinished(entry: Pick<AgentLogEntry, "status">): boolean {
  return ["completed", "complete", "ok", "skipped"].includes(entry.status.toLowerCase());
}
export function progressName(agent: string): string {
  return Object.hasOwn(PROGRESS_NAMES, agent) ? PROGRESS_NAMES[agent as ProgressAgent] : agent;
}

/** Completion-only streams imply the unfinished members of the first unfinished stage.
 * Client receipt times deliberately avoid clock skew and historical cached timestamps.
 * These are estimates, never fabricated start events or agent results.
 */
export function progressEstimate({ steps, finishedAt = {}, elapsed, previousRemaining, complete = false, streaming = true }: {
  steps: Pick<AgentLogEntry, "agent" | "status">[]; finishedAt?: FinishedTimes; elapsed: number;
  previousRemaining?: number; complete?: boolean; streaming?: boolean;
}) {
  const time = seconds(elapsed);
  const done = new Set(steps.filter(isFinished).map(entry => entry.agent).filter(agent => Object.hasOwn(AGENT_TYPICAL_SECONDS, agent)));
  const stageIndex = AGENT_STAGES.findIndex(stage => stage.some(agent => !done.has(agent)));
  const running = !complete && streaming && stageIndex >= 0 ? AGENT_STAGES[stageIndex].filter(agent => !done.has(agent)) : [];
  const stageStart = stageIndex > 0
    ? Math.max(0, ...AGENT_STAGES.slice(0, stageIndex).flatMap(stage => stage.map(agent => seconds(finishedAt[agent] ?? 0)))) : 0;
  const runningElapsed = Math.max(0, time - stageStart);
  const rawRemaining = AGENT_STAGES.reduce((sum, stage) => sum + Math.max(0, ...stage.map(agent => {
    if (done.has(agent)) return 0;
    return running.includes(agent) ? Math.max(0.5, AGENT_TYPICAL_SECONDS[agent] - runningElapsed) : AGENT_TYPICAL_SECONDS[agent];
  })), 0);
  const previous = previousRemaining != null && Number.isFinite(previousRemaining) ? Math.max(0.5, previousRemaining) : Infinity;
  const remaining = complete ? 0 : Math.min(previous, Math.max(0.5, rawRemaining));
  // 1.5x the typical time, but never sooner than 3 s over it: near-instant agents would trip at once.
  const overdue = running.some(agent => runningElapsed > Math.max(AGENT_TYPICAL_SECONDS[agent] * 1.5, AGENT_TYPICAL_SECONDS[agent] + 3));
  const partial = running.reduce((sum, agent) => sum + Math.min(0.95, runningElapsed / AGENT_TYPICAL_SECONDS[agent]), 0);
  const fill = complete || (done.size === 9 && done.has("judge")) ? 100 : Math.min(96, (done.size + partial) / 9 * 100);
  const elapsedSeconds = Math.ceil(time);
  const estimate = complete ? `Finished in ${elapsedSeconds} s`
    : !streaming ? `Waiting for the complete result · ${elapsedSeconds} s`
      : overdue ? `Taking longer than usual · ${elapsedSeconds} s`
        : `About ${Math.ceil(remaining)} s left · ${elapsedSeconds} s so far`;
  return {
    done: done.size, running, remaining, fill, overdue, estimate,
    count: `${done.size} of 9 agents done`,
    runningLabel: complete ? "Completed" : !streaming ? "Waiting for the complete result…"
      : steps.length === 0 ? "Connecting to the agents…"
      : running.length ? `Running: ${running.map(progressName).join(", ")}` : "Finalising result…",
    completionText: `Completed · ${done.size === 9 ? "all 9" : done.size} agents finished in ${elapsedSeconds} s`,
  };
}

export function nearLatest(scrollHeight: number, clientHeight: number, scrollTop: number): boolean {
  return scrollHeight - clientHeight - scrollTop <= 80;
}
