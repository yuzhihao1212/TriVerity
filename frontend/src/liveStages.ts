import type { FinishedTimes } from "./progressEstimate";

// The live run as four stages on a rail, matching the landing page's "How it works". Pure, so
// tests can load it. Evidence first: nothing here names or hints at the ruling.

export const LIVE_STAGES = [
  { id: "gather", title: "Gather the Evidence", live: "Gathering the evidence", agents: ["evidence_loader", "evidence_collector"] },
  { id: "argue", title: "Argue Both Sides", live: "Arguing both sides", agents: ["rider_advocate", "driver_advocate", "fraud_detector"] },
  { id: "answer", title: "Answer Each Other", live: "Each side is answering the other", agents: ["rider_rebuttal", "driver_rebuttal"] },
  { id: "decide", title: "Check the Policy", live: "Checking the policy and explaining", agents: ["precedent_agent", "judge"] },
] as const;
export type StageId = typeof LIVE_STAGES[number]["id"];
export type StageState = "done" | "active" | "pending";
export interface LiveStage { id: StageId; title: string; live: string; agents: readonly string[]; state: StageState; time: string | null }

/** Wall time a finished stage took, from when the stage before it ended (client receipt times). */
function stageTime(agents: readonly string[], earlier: string[], finishedAt: FinishedTimes): string | null {
  const at = (agent: string) => finishedAt[agent as keyof FinishedTimes];
  if (agents.some(agent => at(agent) == null)) return null;
  const end = Math.max(...agents.map(agent => at(agent)!));
  const start = Math.max(0, ...earlier.map(agent => at(agent) ?? 0));
  const seconds = Math.max(0, end - start);
  return seconds < 0.1 ? "instant" : `${seconds.toFixed(1)} s`;
}

/** Done when every agent has finished, active once any has started, otherwise pending. */
export function liveStages({ finished, running, finishedAt = {} }: {
  finished: ReadonlySet<string>; running: readonly string[]; finishedAt?: FinishedTimes;
}): LiveStage[] {
  return LIVE_STAGES.map((stage, index) => {
    const done = stage.agents.every(agent => finished.has(agent));
    const started = stage.agents.some(agent => finished.has(agent) || running.includes(agent));
    const earlier = LIVE_STAGES.slice(0, index).flatMap(previous => [...previous.agents]);
    return { ...stage, state: done ? "done" : started ? "active" : "pending", time: done ? stageTime(stage.agents, earlier, finishedAt) : null };
  });
}

/** The pinned headline: what is happening now, in plain words. */
export function liveHeadline(stages: LiveStage[], { complete, connecting }: { complete: boolean; connecting: boolean }): string {
  if (complete) return "All agents finished";
  if (connecting) return "Connecting to the agents…";
  const active = stages.find(stage => stage.state === "active") ?? stages.find(stage => stage.state === "pending");
  return active ? `${active.live}…` : "Finalising the result…";
}
