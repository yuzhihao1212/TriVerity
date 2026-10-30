import { confidenceNote } from "./decisionState";
import { decisionTone } from "./outcomeTone";
import { PARTY_DECISION_LABELS } from "./partyView";
import { money } from "./presentation";
import type { DisputeCase, Resolution } from "./types";

export const CONFIDENCE_HELP = "Confidence describes how clearly the available facts meet the policy rule. It is set by the rule that applied, not an AI prediction or a probability that the ruling is correct. Safety and other escalation rules can still require human review.";

export function confidenceDisplay(result: Pick<Resolution, "confidence" | "min_confidence" | "decision" | "policy_refs">) {
  const percent = Math.round(result.confidence * 100);
  const threshold = result.min_confidence;
  const known = typeof threshold === "number" && Number.isFinite(threshold) && threshold >= 0 && threshold <= 1;
  const thresholdPercent = known ? threshold * 100 : null;
  const thresholdLabel = thresholdPercent == null ? null : `${Number(thresholdPercent.toFixed(2))}%`;
  const tone = !known ? "neutral" : result.confidence >= threshold ? "ok" : "warn";
  const caption = result.decision === "needs_review" ? confidenceNote(result.decision, percent, result.policy_refs)
    : !known ? "Automatic-decision threshold unavailable in this result."
    : result.confidence < threshold ? `Below ${thresholdLabel}, so a human reviewer decides.`
    : `${result.confidence === threshold ? "At" : "Above"} the ${thresholdLabel} needed to decide automatically.`;
  return { percent, thresholdPercent, thresholdLabel, tone, caption };
}

export function rulingHero(result: Pick<Resolution, "decision" | "refund_amount">) {
  const refund = decisionTone(result.decision) === "ok";
  const amount = refund && result.refund_amount != null ? result.refund_amount : null;
  return {
    label: PARTY_DECISION_LABELS[result.decision], tone: decisionTone(result.decision), amount,
    icon: refund ? "receipt" : result.decision === "needs_review" ? "warning" : "check",
    headline: amount != null ? money(amount) : result.decision === "needs_review" ? "Awaiting human review" : refund ? "Refund approved" : "The charge stands",
    suffix: amount != null ? "back to the rider" : "",
    checklistTitle: amount != null ? `Why the rider gets ${money(amount)}` : result.decision === "needs_review" ? "Why a human needs to decide" : refund ? "Why the refund is approved" : "Why the charge stands",
    summary: result.decision === "partial_refund" ? "The long detour had no recorded time saving, so the extra fare is refunded."
      : result.decision === "full_refund" ? "The charge did not meet the policy requirements, so it is refunded."
      : result.decision === "compensation" ? "The rules approve a fare refund and a credit for lost time."
      : result.decision === "needs_review" ? "An escalation rule requires a human to decide this case."
      : "The charge meets the policy checks.",
  };
}

/** Preserve the engine's order, wording, values and IDs, including unmet checks. */
export function rulingConditions(result: Pick<Resolution, "conditions">) {
  return (result.conditions ?? []).map(check => ({ ...check, symbol: check.met ? "✓" : "⊖", tone: check.met ? "ok" : "neutral", status: check.met ? "Met" : "Not met" }));
}

/** Show a refund equation only when the supplied amount really equals this difference. */
export function refundSum(result: Pick<Resolution, "decision" | "refund_amount">, fare?: DisputeCase["fare"]) {
  if (result.decision !== "partial_refund" || result.refund_amount == null) return null;
  const charged = fare?.actual, expected = fare?.expected;
  if (charged == null || expected == null || !Number.isFinite(charged) || !Number.isFinite(expected)) return null;
  const difference = Math.round((charged - expected) * 100) / 100;
  if (difference < 0 || Math.abs(difference - result.refund_amount) > 0.001) return null;
  return { charged: money(charged), expected: money(expected), amount: money(difference), text: `Charged ${money(charged)} − Expected ${money(expected)} = ${money(difference)}` };
}

export function rulingCredits(result: Pick<Resolution, "explanation_source" | "rider_case" | "driver_case">) {
  const rider = result.rider_case.source === "llm", driver = result.driver_case.source === "llm", judge = result.explanation_source === "llm";
  if (rider && driver && judge) return { source: "llm" as const, text: "Hy3 wrote the arguments and this explanation." };
  if (!rider && !driver && !judge) return { source: "fallback" as const, text: "Checked fallback text supplies the arguments and explanation." };
  return { source: "llm" as const, text: "Hy3 and checked fallback text supplied these steps." };
}
