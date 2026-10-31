// The hand-off into a case (CaseHandoff.tsx): the first time a case opens in this tab, the logo spins
// while it is gathered, its three dots merge into a tick that holds a moment, then the case slides in.
// Pure timing and the once-per-case rule.

export type HandoffPhase = "loading" | "ready" | "leaving";

/** When each part happens, in ms from the case opening behind the veil. */
export interface HandoffPlan { ready: number; leave: number; done: number }

/** Spin 1.5 s; tick draws 0.8 s and holds 0.6 s; the veil lifts as the case slides in (0.45 s). */
export const HANDOFF_PLAN: HandoffPlan = { ready: 1500, leave: 2900, done: 3350 };
/** Reduced motion: the still tick and "Ready for review" for a moment, no spin and no slide. */
export const HANDOFF_PLAN_REDUCED: HandoffPlan = { ready: 0, leave: 700, done: 700 };

export function handoffPlan(reducedMotion: boolean): HandoffPlan {
  return reducedMotion ? HANDOFF_PLAN_REDUCED : HANDOFF_PLAN;
}

/**
 * Once per case per tab, from any way in (queue, sidebar, Start Reviewing, Next Case). Not for the case
 * the console opened on (a pasted link or a refresh), and never again for a case already opened.
 */
export function shouldHandoff({ openedOnLoad, seen }: { openedOnLoad: boolean; seen: boolean }): boolean {
  return !openedOnLoad && !seen;
}

/** What screen readers hear in each phase. */
export function handoffAnnouncement(phase: HandoffPhase, caseId: string): string {
  return phase === "loading" ? `Loading case ${caseId}` : "Ready for review";
}
