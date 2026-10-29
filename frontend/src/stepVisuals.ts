// Pure display logic for the case header, workflow stepper and agent cards.
// Everything here derives from data the console already has; nothing is sent
// to the backend and no ruling, fact or message text is changed.

import { WORKFLOW_TABS, type WorkflowTab } from "./workflow";
import type { AgentLogEntry, Decision, Resolution, ToolCallRecord } from "./types";

export type Tone = "ok" | "warn" | "danger" | "accent" | "neutral";

// ---- Stepper ------------------------------------------------------------
// The stepper shows the REVIEWER's progress. "Agents finished" is the status pill's job.

export type StepPhase = "reviewed" | "available" | "locked" | "working";

export interface StepState {
  tab: WorkflowTab;
  phase: StepPhase;
  /** The reviewer has done this step (Intake: a ruling exists). */
  reviewed: boolean;
  /** The step the reviewer is looking at. */
  current: boolean;
  /** Not selectable yet (no ruling). */
  locked: boolean;
  /** A run is in progress and the agents are on this step. */
  working: boolean;
  /** The first step still to review: a subtle hint, never on the current step. */
  next: boolean;
  /** The connector INTO this step is filled: it lies within the furthest reviewed step. */
  joined: boolean;
}

const HEARING_AGENTS = ["rider_advocate", "driver_advocate", "rider_rebuttal", "driver_rebuttal"];

/** Whether a step's agents have finished, judged from the live log of a run in progress. */
function liveDone(tab: WorkflowTab, agents: Set<string>): boolean {
  const any = (...names: string[]) => names.some(name => agents.has(name));
  switch (tab) {
    case "intake": return true;
    // The fraud detector logs early but belongs to Ruling, so it does not finish Evidence.
    case "evidence": return any("evidence_collector", ...HEARING_AGENTS, "precedent_agent", "judge");
    case "hearing": return (agents.has("rider_rebuttal") && agents.has("driver_rebuttal")) || any("precedent_agent", "judge");
    // The Judge writes the ruling and both party messages.
    case "ruling": case "notify": return agents.has("judge");
  }
}

/** Text shown on Ruling instead of "Next: Notify parties" until the reviewer decides. */
export const DECIDE_FIRST = "Accept or override the ruling to continue to Notify.";

/**
 * The step footer: "primary" when moving on is the next thing to do, "secondary" when
 * it isn't (no result yet, a closed case being re-read), and "hint" on an open Ruling
 * with no decision, where the next thing to do is decide, not move on.
 */
export function nextStepMode({ tab, hasResult, closed, decisionRecorded }: {
  tab: WorkflowTab; hasResult: boolean; closed?: boolean; decisionRecorded?: boolean;
}): "primary" | "secondary" | "hint" {
  if (!hasResult || closed) return "secondary";
  if (tab === "ruling" && !decisionRecorded) return "hint";
  return "primary";
}

export function stepStates({ active, hasResult, busy, liveSteps = [], reviewed = [], nextTab }: {
  active: WorkflowTab; hasResult: boolean; busy: boolean; liveSteps?: AgentLogEntry[];
  /** Overrides the "next" hint, e.g. Ruling while Notify waits for a decision. */
  nextTab?: WorkflowTab;
  /** Steps this case's reviewer has completed (see reviewProgress.ts). */
  reviewed?: Iterable<WorkflowTab>;
}): StepState[] {
  const agents = new Set(liveSteps.map(step => step.agent));
  const working = busy ? WORKFLOW_TABS.findIndex(({ id }) => !liveDone(id, agents)) : -1;
  // Without a ruling there is nothing to review; with one, Intake is done by definition.
  const done = new Set<WorkflowTab>(hasResult ? ["intake", ...reviewed] : []);
  const isDone = WORKFLOW_TABS.map(({ id }) => done.has(id));
  const locked = WORKFLOW_TABS.map(({ id }) => id !== "intake" && !hasResult);
  const furthest = isDone.lastIndexOf(true);
  const complete = isDone.every(Boolean);
  const firstOpen = nextTab ? WORKFLOW_TABS.findIndex(({ id }) => id === nextTab)
    : complete ? -1 : WORKFLOW_TABS.findIndex((_, index) => !isDone[index] && !locked[index]);
  return WORKFLOW_TABS.map(({ id }, index) => {
    const isWorking = index === working;
    return {
      tab: id,
      phase: isWorking ? "working" : isDone[index] ? "reviewed" : locked[index] ? "locked" : "available",
      reviewed: isDone[index],
      current: id === active,
      locked: locked[index],
      working: isWorking,
      next: index === firstOpen && id !== active && !busy,
      joined: index > 0 && index <= furthest,
    };
  });
}

/** Text for screen readers; the circle's look is never the only signal. */
export function stepStatusText(state: StepState): string {
  if (state.working) return "agents working";
  if (state.reviewed) return "reviewed";
  if (state.current) return "current step";
  if (state.locked) return "locked";
  return "not reviewed yet";
}

/** Short labels for narrow screens. */
export const SHORT_TAB_LABELS: Record<WorkflowTab, string> = {
  intake: "Intake", evidence: "Evidence", hearing: "Hearing", ruling: "Ruling", notify: "Notify",
};

// ---- Case header --------------------------------------------------------

/**
 * Whether the route deviation counted against the driver. Before a ruling the rules
 * have not decided: neutral. Policy refs arrive as "RD-1: A route up to 15% …", so the
 * rule ID is matched, not the prose.
 */
export function distanceTone(resolution?: Pick<Resolution, "decision" | "policy_refs"> | null): Tone {
  if (!resolution) return "neutral";
  const refs = resolution.policy_refs ?? [];
  const within = refs.some(ref => /^\s*RD-1\b/.test(ref));
  if (within || resolution.decision === "no_action") return "neutral";
  const refunded = ["partial_refund", "full_refund", "compensation"].includes(resolution.decision);
  const routeRule = refs.some(ref => /^\s*RD-(?!1\b)\d+\b/.test(ref));
  // Attention, not brand red: amber when the deviation counted against the driver.
  return refunded || routeRule ? "warn" : "neutral";
}

/** The outcome a reviewer settled on, when it differs from (or replaces) the AI ruling. */
export interface FinalHeaderOutcome { decision: Decision; amount: number | null; by: "overridden" | "decided" | null }

export interface StatusPill { label: string; tone: Tone; pulse: boolean; /** The exact wording used before this redesign. */ detail: string }

export function statusPill({ busy, streaming, hasResult }: { busy: boolean; streaming: boolean; hasResult: boolean }): StatusPill {
  if (busy) return streaming
    ? { label: "Agents working · live", tone: "accent", pulse: true, detail: "Agents working · live" }
    : { label: "Agents working", tone: "accent", pulse: true, detail: "Agents working · standard resolve" };
  if (hasResult) return { label: "Ruling ready", tone: "ok", pulse: false, detail: "Saved result · no new request" };
  return { label: "Ready for intake", tone: "neutral", pulse: false, detail: "Ready for intake" };
}

// ---- Agent cards ----------------------------------------------------------

export type AgentIcon = "database" | "magnifier" | "shield" | "person" | "wheel" | "books" | "scales" | "generic";

export const AGENT_ICONS: Record<string, AgentIcon> = {
  evidence_loader: "database",
  evidence_collector: "magnifier",
  fraud_detector: "shield",
  rider_advocate: "person",
  rider_rebuttal: "person",
  driver_advocate: "wheel",
  driver_rebuttal: "wheel",
  precedent_agent: "books",
  judge: "scales",
};
export function agentIcon(agent: string): AgentIcon { return Object.hasOwn(AGENT_ICONS, agent) ? AGENT_ICONS[agent] : "generic"; }

const CODE_AGENTS = ["evidence_loader", "fraud_detector", "precedent_agent"];

export type AgentBadge = "llm" | "fallback" | "code" | null;
export function agentBadge(agent: string, source: "llm" | "fallback" | null): AgentBadge {
  if (source) return source;
  return CODE_AGENTS.includes(agent) ? "code" : null;
}

export const FALLBACK_TOOLTIP = "Template text: AI was off or unavailable. The ruling is unaffected.";
export const AI_TOOLTIP = "Written by Tencent Hy3 (Hunyuan), checked against the records before it's shown.";
export const RULES_TOOLTIP = "Calculated by fixed code, no AI. Same input, same answer.";

export function statusBadge(status: string): { label: string; tone: Tone; icon: "check" | "cross" | null } {
  const normal = status.trim().toLowerCase();
  if (normal === "completed" || normal === "complete" || normal === "ok") return { label: "Completed", tone: "ok", icon: "check" };
  if (["failed", "error", "errored"].includes(normal)) return { label: "Failed", tone: "danger", icon: "cross" };
  return { label: status ? status[0].toUpperCase() + status.slice(1) : "Unknown", tone: "neutral", icon: null };
}

/** Drop a leading "[fallback]" / "[llm]" tag: the badge already says it. */
export function stripSourceTag(message: string): string {
  return message.replace(/^\s*\[(?:llm|fallback)\]\s*/i, "");
}

/** "<0.1 s" below 100 ms (including 0, which means under a millisecond), else seconds. */
export function durationText(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  return ms < 100 ? "<0.1 s" : `${(ms / 1000).toFixed(1)} s`;
}

/** This agent's share of the slowest agent in the run, 0..1. */
export function durationShare(ms: number | null | undefined, entries: AgentLogEntry[]): number {
  const slowest = Math.max(0, ...entries.map(entry => entry.duration_ms ?? 0));
  if (ms == null || !Number.isFinite(ms) || ms <= 0 || slowest <= 0) return 0;
  return Math.min(1, ms / slowest);
}

// ---- How agents connect ---------------------------------------------------

/**
 * `edges[i]` labels the arrow after agent i (an unlabelled arrow when null); `result` is the
 * step's end node. Null when the step's agents do not run in sequence.
 */
export interface StepFlow { edges: (string | null)[]; result: string | null }

export function stepFlow(tab: WorkflowTab, entries: AgentLogEntry[], resolution: Resolution): StepFlow | null {
  if (entries.length < 2 && tab !== "evidence") return null;
  if (tab === "evidence") {
    if (!entries.length) return null;
    const total = resolution.judge_evidence.length;
    const loader = entries.find(entry => entry.agent === "evidence_loader");
    const loaded = loader ? Number(/Computed (\d+) facts?/.exec(loader.message)?.[1] ?? NaN) : NaN;
    const plural = (n: number) => `${n} ${n === 1 ? "fact" : "facts"}`;
    const edges = entries.slice(0, -1).map(entry => entry.agent === "evidence_loader" && Number.isFinite(loaded) ? plural(loaded) : null);
    const last = entries.at(-1)!;
    const added = last.agent === "evidence_collector" && Number.isFinite(loaded) && total >= loaded ? `+${plural(total - loaded)}` : null;
    // A single loader with no collector still shows where its facts went.
    return { edges: [...edges, added ?? (last.agent === "evidence_loader" && Number.isFinite(loaded) ? plural(loaded) : null)], result: `${plural(total)} total` };
  }
  if (tab === "ruling") {
    const label = (entry: AgentLogEntry) => {
      if (entry.agent === "fraud_detector") return `Risk: rider ${resolution.risk.rider_risk}, driver ${resolution.risk.driver_risk}`;
      if (entry.agent === "precedent_agent" && resolution.precedents) {
        const n = resolution.precedents.matches.length;
        return `${n} past ${n === 1 ? "ruling" : "rulings"} retrieved`;
      }
      return null;
    };
    // The outcome already heads the case and the ruling below, so the flow ends at the Judge.
    return { edges: entries.slice(0, -1).map(label), result: null };
  }
  return null; // Hearing agents argue in parallel, not in sequence.
}

// ---- Tool calls ---------------------------------------------------------

export const TOOL_NAMES: Record<string, string> = {
  trip_record: "Trip record",
  gps_window: "GPS window",
  gps_stops: "GPS stops",
  fare_lines: "Fare lines",
  chat_window: "Chat window",
  app_events: "App events",
};
export type ToolIcon = "route" | "pin" | "receipt" | "chat" | "bell" | "generic";
const TOOL_ICONS: Record<string, ToolIcon> = {
  trip_record: "route", gps_window: "pin", gps_stops: "pin", fare_lines: "receipt", chat_window: "chat", app_events: "bell",
};

export function toolName(tool: string): string {
  if (Object.hasOwn(TOOL_NAMES, tool)) return TOOL_NAMES[tool];
  const words = tool.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Unknown tool";
}
export function toolIcon(tool: string): ToolIcon { return Object.hasOwn(TOOL_ICONS, tool) ? TOOL_ICONS[tool] : "generic"; }

export function toolTooltip(call: ToolCallRecord): string {
  const n = call.results.length;
  // The fallback's literal "default plan" is never shown (collectionStory.ts).
  const reason = call.reason?.trim().toLowerCase() === "default plan" ? "Standard lookup (AI off)" : call.reason;
  return `${reason || "No reason recorded."} · ${n} ${n === 1 ? "result" : "results"}`;
}

export interface CallColumn { key: "rider" | "driver" | "all"; title: string; calls: ToolCallRecord[] }
/** Rider's side and Driver's side; a single column when calls carry no party. */
export function callColumns(calls: ToolCallRecord[]): CallColumn[] {
  if (!calls.length) return [];
  if (calls.every(call => call.party === "rider" || call.party === "driver")) {
    return ([["rider", "Rider’s side"], ["driver", "Driver’s side"]] as const)
      .map(([key, title]) => ({ key, title, calls: calls.filter(call => call.party === key) }))
      .filter(column => column.calls.length);
  }
  return [{ key: "all", title: "Requested", calls }];
}
