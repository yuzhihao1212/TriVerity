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
  return row ? { row, label: `Next Case: ${row.id} →` } : null;
}

/** What comes after this case, passing over cases on hold: nobody can act on those yet. */
export function nextToReview<T extends QueueRow>(rows: T[], currentId: string, heldIds: readonly string[], guided = GUIDED_DEMO) {
  return nextAfterClose(rows.filter(row => !heldIds.includes(row.id)), currentId, guided);
}

/** Announced when AI Review ends, about the cases that batch ran; null while running or before any run. */
export function reviewSummary(rows: Pick<QueueRow, "id" | "status">[], ran: readonly string[], seconds: number | null = null): string | null {
  const batch = rows.filter(row => ran.includes(row.id) && row.status !== "not_run");
  if (!batch.length) return null;
  const policy = batch.filter(row => row.status === "auto").length;
  const each = seconds == null ? "" : `, ${seconds < 1 ? "under 1 s" : `about ${Math.round(seconds)} s`} ${batch.length === 1 ? "to run" : "each"}`;
  return `Reviewed ${batch.length} ${batch.length === 1 ? "case" : "cases"}${each}: ${batch.length - policy} ${batch.length - policy === 1 ? "requires" : "require"} attention, ${policy} decided by policy.`;
}

/**
 * How long a case's agents took, first step's start to last step's end (parallel steps overlap).
 * This comes from the run that made the result, so a saved sample reports its real run, not the
 * instant it took to fetch. Null when the log has no timings.
 */
export function runSeconds(log: { started_at?: string | null; duration_ms?: number | null }[]): number | null {
  const steps = log.flatMap(step => {
    const start = step.started_at ? Date.parse(step.started_at) : NaN;
    return Number.isFinite(start) ? [{ start, end: start + (step.duration_ms ?? 0) }] : [];
  });
  if (!steps.length) return null;
  return (Math.max(...steps.map(step => step.end)) - Math.min(...steps.map(step => step.start))) / 1000;
}

export function averageRunSeconds(logs: Parameters<typeof runSeconds>[0][]): number | null {
  const times = logs.map(runSeconds).filter((time): time is number => time != null);
  return times.length ? times.reduce((sum, time) => sum + time, 0) / times.length : null;
}

/** The two tiles over the lists; both zero until a case has run. */
export function reviewTiles(rows: Pick<QueueRow, "status">[]) {
  const policy = rows.filter(row => row.status === "auto").length;
  const attention = rows.filter(row => !["not_run", "auto", "closed"].includes(row.status)).length;
  return { attention, policy };
}

/** The case page's run button: the agents with AI, the rules alone without it (as the queue's button). */
export function runAgentsLabel(mode: AiMode, hasResult: boolean): string {
  if (mode === "offline") return hasResult ? "Re-run with Rules" : "Run with Rules";
  return hasResult ? "Re-run Agents" : "Run Agents";
}

/**
 * The queue button says what it will do, and never leaves: with AI off the rules still rule
 * but no AI runs; new cases can always arrive; with none waiting it re-runs the open cases.
 */
export function reviewButtonLabel(mode: AiMode, { running = false, total = 0, fresh = 0, anyRun = false }): string {
  if (running) return `Running ${total} ${total === 1 ? "Case" : "Cases"}…`;
  // "Run", like Run Agents on a case: "Review" is the person's step (Start Reviewing).
  const verb = mode === "offline" ? "Run with Rules" : "Run Agents";
  if (fresh > 0) return anyRun ? `${verb} · ${fresh} New` : verb;
  return mode === "offline" ? "Re-run with Rules" : "Re-run Agents";
}

/** About what one case costs with Hy3; the same figure the Run Agents note gives. */
const COST_PER_CASE = 0.002;

/**
 * What the queue button is about to do, said before it does it. New cases can close on their
 * own and notify the parties, which matters more than the tokens; a re-run only touches open cases.
 */
export function reviewConfirm(mode: AiMode, { count, fresh }: { count: number; fresh: boolean }) {
  const cases = `${count} ${count === 1 ? "case" : "cases"}`;
  const cost = mode === "offline" ? "No AI and no cost."
    : `Uses AI tokens, up to about $${(Math.ceil(count * COST_PER_CASE * 100) / 100).toFixed(2)}.`;
  if (!fresh) return { title: `Re-run the ${count} open ${count === 1 ? "case" : "cases"}?`, body: `${cost} Resolved cases and saved decisions stay as they are.`, action: "Re-run" };
  return {
    title: mode === "offline" ? `Run ${cases} with rules only?` : `Run the agents on ${cases} with Hy3?`,
    body: `${cost} Routine cases will close automatically and notify the rider and driver. Cases that need a person stay in your queue.`,
    action: mode === "offline" ? "Run with Rules" : "Run Agents",
  };
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
export function greetingLine(rows: Pick<QueueRow, "id" | "status">[], heldIds: readonly string[] = []): string {
  const counts = tileCounts(rows);
  const fresh = rows.filter(row => row.status === "not_run").length;
  const cases = (n: number) => `${n} ${n === 1 ? "dispute" : "disputes"}`;
  if (!counts.queue) return "Your queue is empty.";
  // Cases on hold wait on a second reviewer, not on this one.
  const { attention } = reviewTiles(rows.filter(row => !heldIds.includes(row.id)));
  if (attention > 0) return `${cases(attention)} ${attention === 1 ? "needs" : "need"} your attention, out of ${counts.queue} in your queue.`;
  if (fresh === counts.queue) return `${cases(fresh)} ${fresh === 1 ? "is" : "are"} waiting. Routine ones can close themselves; you'll see the rest.`;
  if (fresh > 0) return `${cases(fresh)} still to run, out of ${counts.queue} in your queue.`;
  if (heldIds.length) return `${cases(heldIds.length)} on hold, waiting for a second reviewer.`;
  return `All ${cases(counts.queue)} in your queue have been handled.`;
}
