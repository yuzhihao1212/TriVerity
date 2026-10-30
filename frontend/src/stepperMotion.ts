// Stepper motion (round 8 item 9): timings and the rules behind them, kept pure for tests.
// The pink line shows position only: it runs from step 1 to the current step, never "how far
// is unlocked". Forward: the line travels, the new step arrives, the step left draws its check.
// Back: the line retracts and the earlier step is current at once. Reduced motion: all instant.

import type { WorkflowTab } from "./workflow";

/** The line's travel between two steps. */
export const LINE_MS = 300;
/** The arriving step's small overshoot, after the line lands. */
export const ARRIVE_MS = 420;
/** The live run's completion card (#119) finishes animating by then (its button lands at 1.3 s). */
export const COMPLETION_MS = 1300;
/** Steps 2–5 unlock this far apart once the completion animation is done. */
export const UNLOCK_GAP_MS = 180;

/** How much of the track the line covers: 0 on step 1, 1 on the last step. */
export function lineFraction(activeIndex: number, count: number): number {
  if (count < 2 || activeIndex < 0) return 0;
  return Math.min(activeIndex, count - 1) / (count - 1);
}

export type MoveKind = "forward" | "back";
export interface Move { from: number; to: number; kind: MoveKind; id: number }

/**
 * A new move. A move still animating is settled first (shown in its final state at once),
 * so fast clicks never stack or leave a half-drawn line; the caller snaps it, then starts
 * the new one. Selecting the current step again is no move.
 */
export function nextMove(current: Move | null, from: number, to: number, id: number): { settle: Move | null; move: Move | null } {
  const move = from === to || from < 0 ? null : { from, to, kind: to > from ? "forward" as const : "back" as const, id };
  return { settle: current, move };
}

/** When each step after the first unlocks, in order, once a run has finished. */
export function unlockSchedule<T extends { id: WorkflowTab }>(tabs: readonly T[], start = COMPLETION_MS, gap = UNLOCK_GAP_MS): { tab: WorkflowTab; at: number }[] {
  return tabs.slice(1).map((tab, index) => ({ tab: tab.id, at: start + index * gap }));
}

/** The position line above the bar, e.g. "Step 2 of 5 · Evidence". */
export function positionText(activeIndex: number, count: number, label: string): string {
  return `Step ${activeIndex + 1} of ${count} · ${label}`;
}
