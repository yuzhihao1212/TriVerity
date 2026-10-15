// Pure display logic for the case header, workflow stepper and agent cards.
// Everything here derives from data the console already has; nothing is sent
// to the backend and no ruling, fact or message text is changed.

import { WORKFLOW_TABS, type WorkflowTab } from "./workflow";
import type { AgentLogEntry, Decision, DisputeCase, Resolution, ToolCallRecord } from "./types";

export type Tone = "ok" | "warn" | "accent" | "neutral";

// ---- Stepper ------------------------------------------------------------

export interface StepState {
  tab: WorkflowTab;
  /** The step's work is finished (agents done, or the case added for Intake). */
  done: boolean;
  /** The step the reviewer is looking at. */
  current: boolean;
  /** Not selectable yet (no result). */
  locked: boolean;
  /** Agents are running and this is the next step to finish. */
  inProgress: boolean;
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

export function stepStates({ active, hasResult, busy, liveSteps = [] }: {
  active: WorkflowTab; hasResult: boolean; busy: boolean; liveSteps?: AgentLogEntry[];
}): StepState[] {
  const agents = new Set(liveSteps.map(step => step.agent));
  const done = WORKFLOW_TABS.map(({ id }) => busy ? liveDone(id, agents) : hasResult);
  const firstOpen = busy ? done.indexOf(false) : -1;
  return WORKFLOW_TABS.map(({ id }, index) => ({
    tab: id,
    done: done[index],
    current: id === active,
    locked: id !== "intake" && !hasResult,
    inProgress: index === firstOpen,
  }));
}

/** Text for screen readers; the circle's look is never the only signal. */
export function stepStatusText(state: StepState): string {
  if (state.inProgress) return "in progress";
  if (state.done) return "complete";
  if (state.locked) return "locked";
  return "not started";
}

/** Short labels for narrow screens. */
export const SHORT_TAB_LABELS: Record<WorkflowTab, string> = {
  intake: "Intake", evidence: "Evidence", hearing: "Hearing", ruling: "Ruling", notify: "Notify",
};

// ---- Case header --------------------------------------------------------

export interface HeaderChip { key: string; label: string; tone: Tone }

const money = (amount: number) => `$${amount.toFixed(2)}`;

export function outcomeChip(decision: Decision, refund: number | null): HeaderChip {
  const amount = refund != null && refund > 0 ? ` ${money(refund)}` : "";
  switch (decision) {
    case "partial_refund": return { key: "outcome", label: `Partial refund${amount}`, tone: "ok" };
    case "full_refund": return { key: "outcome", label: `Full refund${amount}`, tone: "ok" };
    case "compensation": return { key: "outcome", label: `Compensation${amount}`, tone: "ok" };
    case "no_action": return { key: "outcome", label: "No action", tone: "neutral" };
    // A human decides: any proposed amount is not an outcome yet.
    case "needs_review": return { key: "outcome", label: "Escalated to a human", tone: "warn" };
  }
}

const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

/** 2-4 chips summarising the case; a chip whose data is missing is skipped. */
export function headerChips(dispute: DisputeCase, resolution?: Resolution): HeaderChip[] {
  const chips: HeaderChip[] = [];
  const expected = num(dispute.trip.expected_distance_km), actual = num(dispute.trip.actual_distance_km);
  if (expected && actual != null) {
    const pct = Math.round((actual / expected - 1) * 100);
    chips.push({ key: "distance", label: `${pct > 0 ? "+" : ""}${pct}% distance`, tone: pct > 0 ? "accent" : "neutral" });
  }
  const wait = num(dispute.trip.driver_wait_min);
  if (wait != null) chips.push({ key: "wait", label: `Driver waited ${wait} min`, tone: "neutral" });
  const charged = num(dispute.fare.actual), fee = num(dispute.fare.cancellation_fee);
  if (charged != null) chips.push({ key: "charged", label: `${money(charged)} charged`, tone: "neutral" });
  else if (fee != null) chips.push({ key: "charged", label: `${money(fee)} no-show fee`, tone: "neutral" });
  if (resolution) chips.push(outcomeChip(resolution.decision, resolution.refund_amount));
  return chips.slice(0, 4);
}

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

export function statusBadge(status: string): { label: string; tone: Tone; icon: "check" | "cross" | null } {
  const normal = status.trim().toLowerCase();
  if (normal === "completed" || normal === "complete" || normal === "ok") return { label: "Completed", tone: "ok", icon: "check" };
  if (["failed", "error", "errored"].includes(normal)) return { label: "Failed", tone: "warn", icon: "cross" };
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
  return `${call.reason || "No reason recorded."} · ${n} ${n === 1 ? "result" : "results"}`;
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
