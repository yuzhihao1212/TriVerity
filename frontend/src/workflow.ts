import type { AgentLogEntry, Resolution } from "./types";

export const WORKFLOW_TABS = [
  { id: "intake", label: "Intake" },
  { id: "evidence", label: "Evidence" },
  { id: "hearing", label: "Hearing" },
  { id: "ruling", label: "Ruling" },
  { id: "notify", label: "Notify Parties" },
] as const;
export type WorkflowTab = typeof WORKFLOW_TABS[number]["id"];

export const AGENT_LABELS: Record<string, string> = {
  evidence_loader: "Evidence loader",
  evidence_collector: "Evidence collector",
  rider_advocate: "Rider advocate",
  driver_advocate: "Driver advocate",
  rider_rebuttal: "Rider rebuttal",
  driver_rebuttal: "Driver rebuttal",
  fraud_detector: "Fraud detector",
  precedent_agent: "Policy & Precedent agent",
  judge: "Judge",
};

// One sentence under each agent's name in "Agents in this step".
export const AGENT_ROLES: Record<string, string> = {
  evidence_loader: "Computes facts from the case data",
  evidence_collector: "Requests extra evidence for each side",
  rider_advocate: "Argues the rider’s case from the evidence",
  driver_advocate: "Argues the driver’s case from the evidence",
  rider_rebuttal: "Answers the driver’s argument once",
  driver_rebuttal: "Answers the rider’s argument once",
  fraud_detector: "Checks both parties for bad-faith signals",
  precedent_agent: "Finds similar past rulings",
  judge: "Applies the policy rules and explains the ruling",
};

export function agentRole(agent: string): string | null { return Object.hasOwn(AGENT_ROLES, agent) ? AGENT_ROLES[agent] : null; }

export function agentLabel(agent: string): string { return Object.hasOwn(AGENT_LABELS, agent) ? AGENT_LABELS[agent] : agent; }

export function agentTab(agent: string): WorkflowTab {
  if (["rider_advocate", "driver_advocate", "rider_rebuttal", "driver_rebuttal"].includes(agent)) return "hearing";
  if (["fraud_detector", "precedent_agent", "judge"].includes(agent)) return "ruling";
  // Preserve new/unmapped log entries in Evidence, rather than silently losing them.
  return "evidence";
}

export function agentsForTab(entries: AgentLogEntry[], tab: WorkflowTab): AgentLogEntry[] {
  return entries.filter(entry => agentTab(entry.agent) === tab);
}

export function agentSource(agent: string, result: Resolution): "llm" | "fallback" | null {
  switch (agent) {
    case "rider_advocate": return result.rider_case.source;
    case "driver_advocate": return result.driver_case.source;
    case "rider_rebuttal": return result.rider_case.rebuttal?.source ?? "fallback";
    case "driver_rebuttal": return result.driver_case.rebuttal?.source ?? "fallback";
    case "judge": return result.explanation_source;
    case "evidence_collector": {
      const source = result.evidence_collection?.source;
      return source === "llm" || source === "fallback" ? source : null;
    }
    default: return null;
  }
}

/** Steps 2-5 wait for a result; Notify also waits while `notifyLocked` (on hold, or no decision yet). */
export function tabLocked(tab: WorkflowTab, hasResult: boolean, notifyLocked = false): boolean {
  return (tab !== "intake" && !hasResult) || (tab === "notify" && notifyLocked);
}

/**
 * Presentation mode: the left and right arrows step through the case like slides. Unlike the tab
 * list's keys it never wraps round, and it skips locked steps; null when there is nowhere to go.
 */
export function presentationStep(current: WorkflowTab, key: string, hasResult: boolean, notifyLocked = false): WorkflowTab | null {
  const step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
  if (!step) return null;
  const index = WORKFLOW_TABS.findIndex(tab => tab.id === current);
  for (let next = index + step; next >= 0 && next < WORKFLOW_TABS.length; next += step) {
    if (!tabLocked(WORKFLOW_TABS[next].id, hasResult, notifyLocked)) return WORKFLOW_TABS[next].id;
  }
  return null;
}

export function navigateTab(current: WorkflowTab, key: string, hasResult: boolean, notifyLocked = false): WorkflowTab {
  const available = WORKFLOW_TABS.filter(tab => tab.id === current || !tabLocked(tab.id, hasResult, notifyLocked));
  const index = Math.max(0, available.findIndex(tab => tab.id === current));
  if (key === "Home") return available[0].id;
  if (key === "End") return available[available.length - 1].id;
  if (key === "ArrowRight") return available[(index + 1) % available.length].id;
  if (key === "ArrowLeft") return available[(index + available.length - 1) % available.length].id;
  return available[index].id;
}

export function savedTab(remembered: WorkflowTab | undefined, hasResult: boolean): WorkflowTab {
  return remembered && !tabLocked(remembered, hasResult) ? remembered : "intake";
}

export function tabProgress(tab: WorkflowTab, result?: Resolution): string {
  if (tab === "intake") return "Case added";
  // Locked steps say nothing each: one line under the stepper explains what opens them.
  if (!result) return "";
  if (tab === "evidence") return `${result.judge_evidence.length} ${result.judge_evidence.length === 1 ? "fact" : "facts"}`;
  if (tab === "hearing") return `${[result.rider_case, result.driver_case].filter(item => item.summary).length} arguments`;
  if (tab === "ruling") return "Decision ready";
  return `${[result.rider_explanation, result.driver_explanation].filter(Boolean).length} messages`;
}
