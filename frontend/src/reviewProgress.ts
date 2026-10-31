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
 * 403), when opening it is all the reviewer can do. Notify needs "Approve & send".
 */
export function openCounts(tab: WorkflowTab, { decisionsUnavailable = false } = {}): boolean {
  if (tab === "evidence" || tab === "hearing") return true;
  if (tab === "ruling") return decisionsUnavailable;
  return false;
}

export interface ReviewSummary { count: number; total: number; complete: boolean; text: string; auto?: boolean }

/** A case the policy closed: finished, but nobody reviewed it. */
export const AUTO_SUMMARY: ReviewSummary = { count: WORKFLOW_TABS.length, total: WORKFLOW_TABS.length, complete: true, text: "Auto-resolved", auto: true };

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
    return new Set<WorkflowTab>([...(memory.get(key) ?? tabs)]);
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
  const set = (key: string, tabs: WorkflowTab[]) => {
    const next = new Set(tabs);
    memory.set(key, next);
    try { const all = readAll(); all[key] = [...next]; storage?.setItem(REVIEW_KEY, JSON.stringify(all)); } catch { /* Memory still holds. */ }
  };
  return { get, add, set, ...createReviewTiming(storage) };
}

/** Closed reviews count as fully reviewed; reopening deliberately clears the last two ticks. */
export function reviewedSteps(tabs: Iterable<WorkflowTab>, closed: boolean): Set<WorkflowTab> {
  return new Set(closed ? WORKFLOW_TABS.map(t => t.id) : tabs);
}
export const REOPENED_STEPS: WorkflowTab[] = ["intake", "evidence", "hearing"];

export const REVIEW_OPENED_KEY = "triverity.reviewOpened";

/** Longer than this is not one sitting (e.g. opened on one day, closed on another): say nothing. */
export const REVIEWED_IN_MAX_MIN = 60;

/** The elapsed review time uses real instants, never the display-only HH:MM string. */
export function reviewedIn(openedAt: number | null, sentTimestamp?: string | null): string | null {
  const sentAt = sentTimestamp ? Date.parse(sentTimestamp) : NaN;
  if (openedAt == null || openedAt < 0 || !Number.isFinite(openedAt) || !Number.isFinite(sentAt) || sentAt < openedAt) return null;
  const minutes = (sentAt - openedAt) / 60_000;
  if (minutes > REVIEWED_IN_MAX_MIN) return null;
  return `Reviewed in ${minutes < 1 ? "under 1 min" : `${Math.round(minutes)} min`}`;
}

/** Timing requires persisted storage; a blocked browser must not imply a known start. */
export function createReviewTiming(storage?: ReviewStoreBackend | null) {
  const readAll = (): Record<string, number> => {
    const parsed = JSON.parse(storage?.getItem(REVIEW_OPENED_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  };
  const openedAt = (key: string): number | null => {
    try {
      const value = readAll()[key];
      return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
    } catch { return null; }
  };
  return {
    openedAt,
    markOpened(key: string, now: number): number | null {
      if (!storage || !Number.isFinite(now) || now < 0) return null;
      try {
        const existing = openedAt(key);
        if (existing != null) return existing;
        const all = readAll();
        all[key] = now;
        for (const old of Object.keys(all).slice(0, -100)) delete all[old];
        storage.setItem(REVIEW_OPENED_KEY, JSON.stringify(all));
        return now;
      } catch { return null; }
    },
  };
}
