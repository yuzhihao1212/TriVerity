import { START_HERE, nextCase, tileCounts, type QueueRow } from "./caseQueue";

/** Separate parts let the header highlight only actionable counts. Zero counts are left out. */
export function queueSummary(rows: Pick<QueueRow, "status">[], appealsAvailable: boolean) {
  const counts = tileCounts(rows);
  const parts = [{ text: `${counts.queue} ${counts.queue === 1 ? "case" : "cases"}`, warning: false }];
  if (counts.decide > 0) parts.push({ text: `${counts.decide} to decide`, warning: true });
  if (counts.ready > 0) parts.push({ text: `${counts.ready} ready`, warning: false });
  if (counts.done > 0) parts.push({ text: `${counts.done} closed`, warning: false });
  if (appealsAvailable && counts.appeals > 0) {
    parts.push({ text: `${counts.appeals} ${counts.appeals === 1 ? "appeal" : "appeals"} waiting`, warning: true });
  }
  return parts;
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
      const row = rows.find(row => row.id === step.id && row.status !== "closed");
      if (row) return { row, label: `Next: Case ${step.number} · ${step.title} →` };
    }
  }
  const row = nextCase(rows, currentId);
  return row ? { row, label: `Next case: ${row.id} →` } : null;
}
