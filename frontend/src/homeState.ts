import type { AiMode } from "./aiMode";
import { START_HERE, nextCase, tileCounts, type QueueRow } from "./caseQueue";

/** Separate parts let the header highlight only actionable counts. Zero counts are left out. */
export function queueSummary(rows: Pick<QueueRow, "status">[], appealsAvailable: boolean) {
  const counts = tileCounts(rows);
  const parts = [{ text: `${counts.queue} ${counts.queue === 1 ? "case" : "cases"}`, warning: false }];
  if (counts.decide > 0) parts.push({ text: `${counts.decide} to decide`, warning: true });
  if (counts.ready > 0) parts.push({ text: `${counts.ready} ready`, warning: false });
  if (counts.auto > 0) parts.push({ text: `${counts.auto} auto-resolved`, warning: false });
  if (counts.done > 0) parts.push({ text: `${counts.done} closed`, warning: false });
  if (appealsAvailable && counts.appeals > 0) {
    parts.push({ text: `${counts.appeals} ${counts.appeals === 1 ? "appeal" : "appeals"} waiting`, warning: true });
  }
  return parts;
}

export type SegmentTone = "warning" | "ready" | "reviewed" | "auto" | "closed" | "new";

/**
 * The queue as ordered status segments for the header bar: what needs a person first, then
 * what is ready, then what is reviewed, then what is auto-resolved, then what is done, then
 * what hasn't run. Every row lands in exactly one segment; zero counts are left out.
 */
export function queueSegments(rows: Pick<QueueRow, "status">[], appealsAvailable: boolean) {
  const count = (...statuses: QueueRow["status"][]) => rows.filter(row => statuses.includes(row.status)).length;
  const segments: { key: string; count: number; label: string; tone: SegmentTone }[] = [
    { key: "decide", count: count("decide"), label: "to decide", tone: "warning" },
    { key: "appeals", count: appealsAvailable ? count("appeal_waiting") : 0, label: "appeal waiting", tone: "warning" },
    { key: "ready", count: count("ready"), label: "ready", tone: "ready" },
    { key: "reviewed", count: count("reviewed", ...(appealsAvailable ? [] : ["appeal_waiting" as const])), label: "reviewed", tone: "reviewed" },
    { key: "auto", count: count("auto"), label: "auto-resolved", tone: "auto" },
    { key: "closed", count: count("closed"), label: "closed", tone: "closed" },
    { key: "new", count: count("not_run", "reopened"), label: "new", tone: "new" },
  ];
  return segments
    .map(segment => segment.key === "appeals" && segment.count > 1 ? { ...segment, label: "appeals waiting" } : segment)
    .filter(segment => segment.count > 0);
}

/** What is at stake in one row, e.g. "$24.80 fare" or "$4.00 fee"; null when the case has no amount. */
export function amountAtStake(fare: { actual?: number | null; cancellation_fee?: number | null }): string | null {
  const ok = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
  if (ok(fare.actual)) return `$${fare.actual.toFixed(2)} fare`;
  if (ok(fare.cancellation_fee)) return `$${fare.cancellation_fee.toFixed(2)} fee`;
  return null;
}

/**
 * The guided demo is hidden while the team finalises the Demo Day flow. Turning this back on
 * restores the home section and the "Next: Case N" hand-off after closing a case.
 */
export const GUIDED_DEMO = false;

/** Only closing a case completes a demo step; reopening makes it next again. */
export function guidedDemoSteps(rows: Pick<QueueRow, "id" | "status">[]) {
  const closed = new Set(rows.filter(row => row.status === "closed").map(row => row.id));
  const nextIndex = START_HERE.findIndex(pick => !closed.has(pick.id));
  return START_HERE.map((pick, index) => ({
    ...pick,
    number: index + 1,
    done: closed.has(pick.id),
    next: index === nextIndex,
    label: index === nextIndex ? (index === 0 ? "Start here" : "Next") : null,
  }));
}

/** Continue the guided sequence when possible; otherwise resume the usual queue. */
export function nextAfterClose<T extends QueueRow>(rows: T[], currentId: string, guided = GUIDED_DEMO) {
  const steps = guidedDemoSteps(rows);
  const current = guided ? steps.findIndex(step => step.id === currentId) : -1;
  if (current >= 0) {
    for (const step of steps.slice(current + 1)) {
      // Auto-resolved is closed too (by the policy): nothing left for the reviewer there.
      const row = rows.find(row => row.id === step.id && row.status !== "closed" && row.status !== "auto");
      if (row) return { row, label: `Next: Case ${step.number} · ${step.title} →` };
    }
  }
  const row = nextCase(rows, currentId);
  return row ? { row, label: `Next case: ${row.id} →` } : null;
}

/** Announced when AI Review ends, about the cases that batch ran; null while running or before any run. */
export function reviewSummary(rows: Pick<QueueRow, "id" | "status">[], ran: readonly string[]): string | null {
  const batch = rows.filter(row => ran.includes(row.id) && row.status !== "not_run");
  if (!batch.length) return null;
  const policy = batch.filter(row => row.status === "auto").length;
  return `Reviewed ${batch.length} ${batch.length === 1 ? "case" : "cases"}: ${batch.length - policy} require attention, ${policy} decided by policy.`;
}

/** The two tiles over the lists; both zero until a case has run. */
export function reviewTiles(rows: Pick<QueueRow, "status">[]) {
  const policy = rows.filter(row => row.status === "auto").length;
  const attention = rows.filter(row => !["not_run", "auto", "closed"].includes(row.status)).length;
  return { attention, policy };
}

/**
 * The queue button says what it will do, and never leaves: with Hy3 off the rules still rule
 * but no AI runs; new cases can always arrive; with none waiting it re-runs the open cases.
 */
export function reviewButtonLabel(mode: AiMode, { running = false, total = 0, fresh = 0, anyRun = false }): string {
  if (running) return `Reviewing ${total} ${total === 1 ? "case" : "cases"}…`;
  const verb = mode === "offline" ? "Review with rules" : "AI Review";
  if (fresh > 0) return anyRun ? `${verb} · ${fresh} new` : verb;
  return mode === "offline" ? "Re-run with rules" : "Re-run AI Review";
}

/**
 * What a re-run may touch: a case still waiting on a person with nothing saved. Closed cases go
 * through Reopen (the parties were told), and a re-run would wipe a saved decision or a hold.
 */
export function rerunnable<T extends Pick<QueueRow, "id" | "status">>(rows: T[], heldIds: readonly string[]): T[] {
  return rows.filter(row => (row.status === "decide" || row.status === "ready") && !heldIds.includes(row.id));
}

/** The fold on the resolved list holds for this tab; blocked storage just starts open. */
export const RESOLVED_FOLDED_KEY = "triverity.resolvedFolded";
export function readFolded(storage: Pick<Storage, "getItem"> | null): boolean {
  try { return storage?.getItem(RESOLVED_FOLDED_KEY) === "1"; } catch { return false; }
}
export function writeFolded(storage: Pick<Storage, "setItem"> | null, folded: boolean): void {
  try { storage?.setItem(RESOLVED_FOLDED_KEY, folded ? "1" : "0"); } catch { /* Holds for this view only. */ }
}

/** Only when the review didn't use AI throughout: switched off on purpose, or AI wasn't available. */
export function reviewNote(mode: AiMode, ran: number, fallbacks: number): string | null {
  if (!ran) return null;
  if (mode === "offline") return "AI is off: arguments use template text.";
  if (!fallbacks) return null;
  return `${fallbacks} ${fallbacks === 1 ? "case" : "cases"} used template text because AI was unavailable.`;
}

/** "22 Sep" from "2026-09-22", read as written so a timezone can't move the day. */
export function shortDate(iso: string | null | undefined): string | null {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(iso ?? "");
  const month = match && ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(match[1]) - 1];
  return month ? `${Number(match![2])} ${month}` : null;
}

/** Today in the reviewer's own time, as a dispute's raised date. */
export function todayIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** "Good morning" / "Good afternoon" / "Good evening", from the reviewer's own clock. */
export function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** One plain line under the greeting: what's waiting, and what needs the reviewer. */
export function greetingLine(rows: Pick<QueueRow, "status">[]): string {
  const counts = tileCounts(rows);
  const fresh = rows.filter(row => row.status === "not_run").length;
  const cases = (n: number) => `${n} ${n === 1 ? "dispute" : "disputes"}`;
  if (!counts.queue) return "Your queue is empty.";
  const { attention } = reviewTiles(rows);
  if (attention > 0) return `${cases(attention)} ${attention === 1 ? "needs" : "need"} your attention, out of ${counts.queue} in your queue.`;
  if (fresh === counts.queue) return `${cases(fresh)} ${fresh === 1 ? "is" : "are"} waiting. Routine ones can close themselves; you'll see the rest.`;
  if (fresh > 0) return `${cases(fresh)} still to run, out of ${counts.queue} in your queue.`;
  return `All ${cases(counts.queue)} in your queue have been handled.`;
}
