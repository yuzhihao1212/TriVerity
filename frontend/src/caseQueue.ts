// The reviewer's queue: one status per case, the queue order, the next case and the home
// tiles. One source of truth for the wording, used by the home page and the sidebar.

import type { Decision, TriageTier } from "./types";

export type CaseStatus = "not_run" | "ready" | "decide" | "reviewed" | "sent";

export const STATUS_WORDS: Record<CaseStatus, string> = {
  not_run: "Not run", ready: "Ready", decide: "Decide", reviewed: "Reviewed", sent: "Sent",
};
/** Icon.tsx names; always shown with the word. */
export const STATUS_ICONS: Record<CaseStatus, string> = {
  not_run: "generic", ready: "scales", decide: "warning", reviewed: "check", sent: "send",
};

/**
 * Not run (no ruling) · Ready (ruled, not decided) · Decide (escalated, not decided) ·
 * Reviewed (decided, not sent) · Sent.
 */
export function caseStatus(result: { decision: Decision } | null | undefined, decided: boolean, sent: boolean): CaseStatus {
  if (!result) return "not_run";
  if (sent) return "sent";
  if (decided) return "reviewed";
  return result.decision === "needs_review" ? "decide" : "ready";
}

export interface QueueRow { id: string; status: CaseStatus; tier?: TriageTier | null; decision?: Decision | null }

const STATUS_ORDER: Record<CaseStatus, number> = { decide: 0, ready: 1, reviewed: 2, not_run: 3, sent: 4 };
const TIER_ORDER: Record<string, number> = { safety: 0, high: 1, standard: 2, low: 3 };

/** Decide (safety tier first), then Ready, Reviewed, Not run, Sent; stable otherwise. */
export function sortQueue<T extends QueueRow>(rows: T[]): T[] {
  return rows.map((row, index) => ({ row, index })).sort((a, b) =>
    STATUS_ORDER[a.row.status] - STATUS_ORDER[b.row.status]
    || (a.row.status === "decide" ? (TIER_ORDER[a.row.tier ?? ""] ?? 9) - (TIER_ORDER[b.row.tier ?? ""] ?? 9) : 0)
    || a.index - b.index).map(item => item.row);
}

/** The next case still to do in queue order (not sent, not the current one); null when none is left. */
export function nextCase<T extends QueueRow>(rows: T[], currentId: string | null): T | null {
  return sortQueue(rows).find(row => row.id !== currentId && row.status !== "sent") ?? null;
}

export interface Tiles { queue: number; ready: number; decide: number; done: number }
export function tileCounts(rows: Pick<QueueRow, "status">[]): Tiles {
  const count = (status: CaseStatus) => rows.filter(row => row.status === status).length;
  return { queue: rows.length, ready: count("ready"), decide: count("decide"), done: count("sent") };
}

/** "Start here" picks, shown only until the first case has been run this session. */
export const START_HERE: { id: string; title: string; icon: string }[] = [
  { id: "D001", title: "Detour caught", icon: "route" },
  { id: "D006", title: "Fee upheld", icon: "receipt" },
  { id: "D007", title: "Escalated", icon: "warning" },
];
