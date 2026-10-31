import { FINAL_LABELS } from "./decisionState";
import type { Appeal, Decision } from "./types";

export function appealLine(appeal: Pick<Appeal, "id" | "party">): string {
  return `${appeal.party === "rider" ? "Rider" : "Driver"} appealed · ${appeal.id}`;
}

export function originalDecisionText(decision: Decision): string {
  return `Original decision: ${decision === "needs_review" ? "Needs review" : FINAL_LABELS[decision]}`;
}

/** What a decided appeal leaves to do: recording it never changes the decision the parties were sent. */
export function appealFollowUp(appeal: Pick<Appeal, "status" | "reviewer_decision">, current: { decision: Decision; text: string } | null, closed: boolean): string | null {
  if (appeal.status !== "decided" || !appeal.reviewer_decision || !current) return null;
  if (appeal.reviewer_decision === current.decision) return `This matches the current decision (${current.text}). Nothing new goes to the parties.`;
  return `Saved as a precedent only. The current decision is still ${current.text}, and the parties have not been told. ${closed ? "Reopen the case to send a correction." : "Change the decision in this review to send a correction."}`;
}

export function decidedAppealLine(appeal: Pick<Appeal, "id" | "reviewer_decision" | "precedent_id">): string {
  const decision = appeal.reviewer_decision ? `: ${FINAL_LABELS[appeal.reviewer_decision]}` : "";
  const precedent = appeal.precedent_id ? ` · saved as precedent ${appeal.precedent_id}` : "";
  return `Appeal ${appeal.id} decided${decision}${precedent}`;
}
