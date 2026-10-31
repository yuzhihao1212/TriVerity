// The reviewer's queue: one status per case, the queue order, the next case and the home
// tiles. One source of truth for the wording, used by the home page and the sidebar.

import type { Decision, TriageTier } from "./types";

export type CaseStatus = "not_run" | "ready" | "decide" | "reviewed" | "auto" | "closed" | "reopened" | "appeal_waiting";

export const STATUS_WORDS: Record<CaseStatus, string> = {
  not_run: "New", ready: "Ready", decide: "Decide", reviewed: "Reviewed", auto: "Auto-resolved", closed: "Closed", reopened: "Reopened", appeal_waiting: "Appeal waiting",
};
/** Icon.tsx names; always shown with the word. */
export const STATUS_ICONS: Record<CaseStatus, string> = {
  not_run: "generic", ready: "scales", decide: "warning", reviewed: "check", auto: "check", closed: "check", reopened: "folder", appeal_waiting: "appeal",
};

/**
 * New (no ruling yet) · Ready (ruled, not decided) · Decide (escalated, not decided) ·
 * Reviewed (decided, not closed) · Auto-resolved (closed by the policy, no reviewer) · Closed.
 */
export function caseStatus(result: { decision: Decision } | null | undefined, decided: boolean, closed: boolean,
  { reopened = false, appealWaiting = false, autoClosed = false } = {}): CaseStatus {
  if (!result) return "not_run";
  if ((closed || reopened) && appealWaiting) return "appeal_waiting";
  // Closed by the policy without a reviewer (the parties were notified): its own lane.
  if (closed) return autoClosed ? "auto" : "closed";
  if (reopened) return "reopened";
  if (decided) return "reviewed";
  return result.decision === "needs_review" ? "decide" : "ready";
}

/** Backend open appeals are named queued; also accept pending for status compatibility. */
export function pendingAppealIds(appeals: readonly { dispute_id: string; status: string }[] | null): Set<string> {
  return new Set((appeals ?? []).filter(a => a.status === "queued" || a.status === "pending").map(a => a.dispute_id));
}
/** Appeal waiting may be closed OR reopened, so callers supply the actual closed state. */
export function allowedActions(status: CaseStatus, closed = status === "closed" || status === "auto" || status === "appeal_waiting") {
  return { run: !closed, decide: !closed, editNotes: !closed, send: !closed, reopen: closed };
}

export interface QueueRow { id: string; status: CaseStatus; tier?: TriageTier | null; decision?: Decision | null; audit?: boolean; raisedAt?: string | null }

const STATUS_ORDER: Record<CaseStatus, number> = { decide: 0, appeal_waiting: 0, ready: 1, reviewed: 2, auto: 3, not_run: 4, closed: 5, reopened: 2 };
const TIER_ORDER: Record<string, number> = { safety: 0, high: 1, standard: 2, low: 3 };

/** Decide (safety tier first), then Ready, Reviewed, Auto-resolved, Not run, Closed; stable otherwise. */
export function sortQueue<T extends QueueRow>(rows: T[]): T[] {
  return rows.map((row, index) => ({ row, index })).sort((a, b) =>
    STATUS_ORDER[a.row.status] - STATUS_ORDER[b.row.status]
    || (STATUS_ORDER[a.row.status] === 0 && STATUS_ORDER[b.row.status] === 0 ? (TIER_ORDER[a.row.tier ?? ""] ?? 9) - (TIER_ORDER[b.row.tier ?? ""] ?? 9) : 0)
    || a.index - b.index).map(item => item.row);
}

/** Safety first, then whoever raised their dispute earliest; undated cases last, in status order. */
export function oldestFirst<T extends QueueRow>(rows: T[]): T[] {
  const raised = (row: T) => row.raisedAt ?? "9999";
  return rows.map((row, index) => ({ row, index })).sort((a, b) =>
    Number(b.row.tier === "safety") - Number(a.row.tier === "safety")
    || raised(a.row).localeCompare(raised(b.row))
    || STATUS_ORDER[a.row.status] - STATUS_ORDER[b.row.status]
    || a.index - b.index).map(item => item.row);
}

export interface QueueSection<T> { label: string | null; rows: T[] }
/**
 * A list holding a safety case splits under two labels, so the case sitting above older dates reads
 * as moved up on purpose. Without one, or with nothing else, it stays a single unlabelled list.
 */
export function safetySections<T extends QueueRow>(rows: T[]): QueueSection<T>[] {
  const safety = rows.filter(row => row.tier === "safety");
  if (safety.length === 0 || safety.length === rows.length) return [{ label: null, rows }];
  return [{ label: "Safety First", rows: safety }, { label: "Oldest First", rows: rows.filter(row => row.tier !== "safety") }];
}

/** The queue's three lists: what a person still has to act on, what hasn't run, and what is finished. */
export function queueGroups<T extends QueueRow>(rows: T[]) {
  const resolved = (row: T) => row.status === "auto" || row.status === "closed";
  return {
    review: oldestFirst(rows.filter(row => row.status !== "not_run" && !resolved(row))),
    fresh: oldestFirst(rows.filter(row => row.status === "not_run")),
    resolved: oldestFirst(rows.filter(resolved)),
  };
}

/** The next case still to do in queue order (not closed or auto-resolved, not the current one); null when none is left. */
export function nextCase<T extends QueueRow>(rows: T[], currentId: string | null): T | null {
  const { review, fresh } = queueGroups(rows);
  return [...review, ...fresh].find(row => row.id !== currentId) ?? null;
}

export interface Tiles { queue: number; ready: number; decide: number; auto: number; done: number; appeals: number }
export function tileCounts(rows: Pick<QueueRow, "status">[]): Tiles {
  const count = (status: CaseStatus) => rows.filter(row => row.status === status).length;
  return { queue: rows.length, ready: count("ready"), decide: count("decide"), auto: count("auto"), done: count("closed"), appeals: count("appeal_waiting") };
}

/** The three cases in the guided demo, in presentation order. Titles say what each case is, never its outcome. */
export const START_HERE: { id: string; title: string; blurb: string; icon: string }[] = [
  { id: "D001", title: "A Route Dispute", blurb: "Rider says the trip was too long", icon: "route" },
  { id: "D006", title: "A No-show Fee", blurb: "Rider disputes a $4.00 fee", icon: "receipt" },
  { id: "D007", title: "A Safety Flag", blurb: "Threat in the chat", icon: "warning" },
];
