import { FINAL_LABELS } from "./decisionState";
import type { Appeal, Decision } from "./types";

export function appealLine(appeal: Pick<Appeal, "id" | "party">): string {
  return `${appeal.party === "rider" ? "Rider" : "Driver"} appealed · ${appeal.id}`;
}

export function originalDecisionText(decision: Decision): string {
  return `Original decision: ${decision === "needs_review" ? "Needs review" : FINAL_LABELS[decision]}`;
}

export function decidedAppealLine(appeal: Pick<Appeal, "id" | "reviewer_decision" | "precedent_id">): string {
  const decision = appeal.reviewer_decision ? `: ${FINAL_LABELS[appeal.reviewer_decision]}` : "";
  const precedent = appeal.precedent_id ? ` · saved as precedent ${appeal.precedent_id}` : "";
  return `Appeal ${appeal.id} decided${decision}${precedent}`;
}
