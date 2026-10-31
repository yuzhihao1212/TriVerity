// The first-visit guide: three short steps from the queue to a decision. Each one follows what has
// actually happened, so it never asks for something already done. Pure, apart from the saved flag.

const DONE_KEY = "triverity.firstVisitGuideDone";

type Store = Pick<Storage, "getItem" | "setItem"> | null;

export function readGuideDone(store: Store): boolean {
  try { return store?.getItem(DONE_KEY) === "1"; } catch { return false; }
}
export function writeGuideDone(store: Store): void {
  try { store?.setItem(DONE_KEY, "1"); } catch { /* Storage may be blocked: the guide just returns next visit. */ }
}

export const GUIDE_STEPS = 3;

export interface HomeGuide { step: 1 | 2; text: string; target: "review" | "start" }

/** What the owl says on the queue: run the cases, then open the first one that needs a person. */
export function homeGuide({ done, running, canReview, toReview, aiLive }: {
  done: boolean; running: boolean; canReview: boolean; toReview: boolean; aiLive: boolean;
}): HomeGuide | null {
  if (done || running) return null;
  if (toReview) return { step: 2, text: "Start Reviewing opens the first case that needs a person.", target: "start" };
  if (canReview) return { step: 1, text: `Press ${aiLive ? "AI Review" : "Review with Rules"} to run the queue. It asks before it starts.`, target: "review" };
  return null;
}

export const LAST_STEP_TEXT = "Read the ruling, then make the call. Nothing reaches the rider or driver until you approve it.";

/** The last step shows on a case that's waiting for a decision. No owl there: these are real disputes. */
export function caseGuideShows({ done, hasResult, canDecide, decided }: {
  done: boolean; hasResult: boolean; canDecide: boolean; decided: boolean;
}): boolean {
  return !done && hasResult && canDecide && !decided;
}

/** Past Intake the reviewer knows the case: the brief and the stepper shrink, so the step's content comes first. */
export function compactCaseHead(tab: string, running: boolean): boolean {
  return tab !== "intake" && !running;
}
