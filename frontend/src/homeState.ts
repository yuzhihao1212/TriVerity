import { START_HERE, tileCounts, type QueueRow } from "./caseQueue";

/** Separate parts let the header highlight only actionable counts. */
export function queueSummary(rows: Pick<QueueRow, "status">[], appealsAvailable: boolean) {
  const counts = tileCounts(rows);
  const parts = [
    { text: `${counts.queue} ${counts.queue === 1 ? "case" : "cases"}`, warning: false },
    { text: `${counts.decide} to decide`, warning: counts.decide > 0 },
    { text: `${counts.ready} ready`, warning: false },
    { text: `${counts.done} closed`, warning: false },
  ];
  if (appealsAvailable && counts.appeals > 0) {
    parts.push({ text: `${counts.appeals} ${counts.appeals === 1 ? "appeal" : "appeals"} waiting`, warning: true });
  }
  return parts;
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
