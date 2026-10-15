import type { Decision, Resolution } from "./types";

export const PARTY_DECISION_LABELS: Record<Decision, string> = {
  partial_refund: "Partial refund approved",
  full_refund: "Full refund approved",
  compensation: "Compensation approved",
  no_action: "No change to the charge",
  needs_review: "A human reviewer will decide",
};

// Mirror PartyResolution.of: explicitly select party-safe fields. Never spread
// the internal resolution into this view or include the reviewer's proposal.
export function partyView(resolution: Resolution, party: "rider" | "driver") {
  const refundGiven = ["partial_refund", "full_refund", "compensation"].includes(resolution.decision);
  return {
    decision: resolution.decision,
    refund_amount: refundGiven ? resolution.refund_amount : null,
    message: party === "rider" ? resolution.rider_explanation : resolution.driver_explanation,
    explanation_source: resolution.explanation_source,
  };
}
