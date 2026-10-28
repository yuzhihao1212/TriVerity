// The reviewer's queue: one status per case, the queue order, the next case and the home
// tiles. One source of truth for the wording, used by the home page and the sidebar.

import type { Decision, TriageTier } from "./types";

export type CaseStatus = "not_run" | "ready" | "decide" | "reviewed" | "closed" | "reopened" | "appeal_waiting";

export const STATUS_WORDS: Record<CaseStatus, string> = {
  not_run: "Not run", ready: "Ready", decide: "Decide", reviewed: "Reviewed", closed: "Closed", reopened: "Reopened", appeal_waiting: "Appeal waiting",
};
/** Icon.tsx names; always shown with the word. */
export const STATUS_ICONS: Record<CaseStatus, string> = {
  not_run: "generic", ready: "scales", decide: "warning", reviewed: "check", closed: "check", reopened: "folder", appeal_waiting: "appeal",
};

/**
 * Not run (no ruling) · Ready (ruled, not decided) · Decide (escalated, not decided) ·
 * Reviewed (decided, not closed) · Closed.
 */
export function caseStatus(result: { decision: Decision } | null | undefined, decided: boolean, closed: boolean,
  { reopened = false, appealWaiting = false } = {}): CaseStatus {
  if (!result) return "not_run";
  if ((closed || reopened) && appealWaiting) return "appeal_waiting";
  if (closed) return "closed";
  if (reopened) return "reopened";
  if (decided) return "reviewed";
  return result.decision === "needs_review" ? "decide" : "ready";
}

/** Backend open appeals are named queued; also accept pending for status compatibility. */
export function pendingAppealIds(appeals: readonly { dispute_id: string; status: string }[] | null): Set<string> {
  return new Set((appeals ?? []).filter(a => a.status === "queued" || a.status === "pending").map(a => a.dispute_id));
}
/** Appeal waiting may be closed OR reopened, so callers supply the actual closed state. */
export function allowedActions(status: CaseStatus, closed = status === "closed" || status === "appeal_waiting") {
  return { run: !closed, decide: !closed, editNotes: !closed, send: !closed, reopen: closed };
}

export interface QueueRow { id: string; status: CaseStatus; tier?: TriageTier | null; decision?: Decision | null }

const STATUS_ORDER: Record<CaseStatus, number> = { decide: 0, ready: 1, reviewed: 2, not_run: 3, closed: 4, reopened: 2, appeal_waiting: 0 };
const TIER_ORDER: Record<string, number> = { safety: 0, high: 1, standard: 2, low: 3 };

/** Decide (safety tier first), then Ready, Reviewed, Not run, Closed; stable otherwise. */
export function sortQueue<T extends QueueRow>(rows: T[]): T[] {
  return rows.map((row, index) => ({ row, index })).sort((a, b) =>
    STATUS_ORDER[a.row.status] - STATUS_ORDER[b.row.status]
    || (STATUS_ORDER[a.row.status] === 0 && STATUS_ORDER[b.row.status] === 0 ? (TIER_ORDER[a.row.tier ?? ""] ?? 9) - (TIER_ORDER[b.row.tier ?? ""] ?? 9) : 0)
    || a.index - b.index).map(item => item.row);
}

/** The next case still to do in queue order (not closed, not the current one); null when none is left. */
export function nextCase<T extends QueueRow>(rows: T[], currentId: string | null): T | null {
  return sortQueue(rows).find(row => row.id !== currentId && row.status !== "closed") ?? null;
}

export interface Tiles { queue: number; ready: number; decide: number; done: number; appeals: number }
export function tileCounts(rows: Pick<QueueRow, "status">[]): Tiles {
  const count = (status: CaseStatus) => rows.filter(row => row.status === status).length;
  return { queue: rows.length, ready: count("ready"), decide: count("decide"), done: count("closed"), appeals: count("appeal_waiting") };
}

/** The three cases in the guided demo, in presentation order. */
export const START_HERE: { id: string; title: string; blurb: string; icon: string }[] = [
  { id: "D001", title: "Detour caught", blurb: "Refund for a detour", icon: "route" },
  { id: "D006", title: "Fee upheld", blurb: "A fair no-show fee", icon: "receipt" },
  { id: "D007", title: "Knows when to stop", blurb: "Goes to a human", icon: "warning" },
];
