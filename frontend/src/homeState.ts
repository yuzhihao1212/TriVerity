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
export function nextAfterClose<T extends QueueRow>(rows: T[], currentId: string) {
  const steps = guidedDemoSteps(rows);
  const current = steps.findIndex(step => step.id === currentId);
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

/**
 * The line after "Run all", about the cases that batch ran (never the user's own disputes,
 * which Run all leaves alone): how many closed automatically and how many need a person,
 * audit samples included. Null while running or before any run.
 */
export function runAllSummary(rows: Pick<QueueRow, "id" | "status" | "audit">[], ran: readonly string[]): string | null {
  const batch = rows.filter(row => ran.includes(row.id) && row.status !== "not_run");
  if (!batch.length) return null;
  const auto = batch.filter(row => row.status === "auto").length;
  const person = batch.filter(row => row.status === "decide" || row.status === "ready").length;
  const audits = batch.filter(row => row.audit && row.status === "ready").length;
  const parts = [`Run all: ${batch.length} ${batch.length === 1 ? "case" : "cases"}`, `${auto} auto-resolved`, `${person} for review`];
  if (audits) parts.push(`${audits} audit ${audits === 1 ? "sample" : "samples"}`);
  return parts.join(" · ");
}
