// The reviewer's own progress through a case, per ruling, for this browser session.
// Pure apart from the storage it is handed, so it is testable.

import { WORKFLOW_TABS, type WorkflowTab } from "./workflow";
import type { Resolution } from "./types";

/**
 * One review per ruling: a new run gives the case a new key, so its progress starts
 * over (a fresh ruling needs a fresh review). Keyed like ReviewerDecision.
 */
export function reviewKey(disputeId: string, resolution: Pick<Resolution, "agent_log">): string {
  return `${disputeId}|${resolution.agent_log[0]?.started_at ?? ""}`;
}

/**
 * Whether opening a step counts as reviewing it. Evidence and Hearing: yes. Ruling
 * needs an accepted/overridden decision, unless recording is unavailable (public demo,
 * 403), when opening it is all the reviewer can do. Notify needs both phones seen.
 */
export function openCounts(tab: WorkflowTab, { decisionsUnavailable = false } = {}): boolean {
  if (tab === "evidence" || tab === "hearing") return true;
  if (tab === "ruling") return decisionsUnavailable;
  return false;
}

export interface ReviewSummary { count: number; total: number; complete: boolean; text: string }

/** "Reviewed 2 of 5 steps", or "Review complete" (Intake counts once a ruling exists). */
export function reviewSummary(reviewed: Iterable<WorkflowTab>): ReviewSummary {
  const done = new Set<WorkflowTab>(["intake", ...reviewed]);
  const total = WORKFLOW_TABS.length;
  const count = WORKFLOW_TABS.filter(({ id }) => done.has(id)).length;
  const complete = count === total;
  return { count, total, complete, text: complete ? "Review complete" : `Reviewed ${count} of ${total} steps` };
}

export interface ReviewStoreBackend { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const REVIEW_KEY = "triverity.review";
const TABS = new Set<string>(WORKFLOW_TABS.map(tab => tab.id));

/**
 * Reviewed steps per review key. Uses sessionStorage when available and always an
 * in-memory map, so blocked or corrupt storage still keeps progress for this page load.
 */
export function createReviewStore(storage?: ReviewStoreBackend | null) {
  const memory = new Map<string, Set<WorkflowTab>>();
  const readAll = (): Record<string, string[]> => {
    try {
      const parsed = JSON.parse(storage?.getItem(REVIEW_KEY) ?? "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  };
  const get = (key: string): Set<WorkflowTab> => {
    const stored = readAll()[key];
    const tabs = Array.isArray(stored) ? stored.filter((tab): tab is WorkflowTab => TABS.has(tab)) : [];
    return new Set<WorkflowTab>([...(memory.get(key) ?? []), ...tabs]);
  };
  const add = (key: string, tab: WorkflowTab): boolean => {
    const current = get(key);
    if (current.has(tab)) return false;
    current.add(tab);
    memory.set(key, current);
    try {
      const all = readAll();
      all[key] = [...current];
      // Keep the record small: the most recent 100 reviews.
      const keys = Object.keys(all);
      for (const old of keys.slice(0, Math.max(0, keys.length - 100))) delete all[old];
      storage?.setItem(REVIEW_KEY, JSON.stringify(all));
    } catch { /* Storage blocked or full: the in-memory map still holds. */ }
    return true;
  };
  return { get, add };
}
