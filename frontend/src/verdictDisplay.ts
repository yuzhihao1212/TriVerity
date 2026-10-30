import { confidenceNote } from "./decisionState";
import { decisionTone } from "./outcomeTone";
import { PARTY_DECISION_LABELS } from "./partyView";
import { money } from "./presentation";
import { appliedRuleIds, conditionGroups } from "./rulingDetails";
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
    : result.confidence < threshold ? `Below the ${thresholdLabel} minimum, so a human reviewer decides.`
    : `${result.confidence === threshold ? "At" : "Above"} the ${thresholdLabel} minimum, so the rules decide.`;
  return { percent, thresholdPercent, thresholdLabel, tone, caption };
}

/**
 * One plain sentence for the rule that decided the case. Keyed by rule, so a new rule never
 * borrows another rule's reason; anything unlisted falls back to a sentence about the outcome.
 */
export function rulingSummary(result: Pick<Resolution, "decision" | "policy_refs">): string {
  const applied = appliedRuleIds(result.policy_refs);
  const has = (...rules: string[]) => rules.some(rule => applied.includes(rule));
  const noShow = applied.some(rule => rule.startsWith("NS-"));
  switch (result.decision) {
    case "needs_review": return "An escalation rule requires a human to decide this case.";
    case "compensation": return has("RD-5")
      ? "The long detour also took longer and included a long stop, so the extra fare is refunded with a credit for the lost time."
      : "The rules approve compensation.";
    case "partial_refund": return has("RD-3")
      ? "The route was much longer than planned and also took longer, so the extra fare is refunded."
      : "The rules approve a partial refund.";
    case "full_refund": return noShow
      ? "A no-show fee condition was not met, so the fee is refunded."
      : "The charge did not meet the policy requirements, so it is refunded.";
    default: return has("RD-1") ? "The route was within the normal distance tolerance, so the fare stands."
      : has("RD-2") ? "The longer route took no longer than planned, so the fare stands."
      : noShow ? "The driver met every no-show fee condition, so the fee stands."
      : "The charge meets the policy checks.";
  }
}

export function rulingHero(result: Pick<Resolution, "decision" | "refund_amount" | "policy_refs">) {
  const refund = decisionTone(result.decision) === "ok";
  const amount = refund && result.refund_amount != null ? result.refund_amount : null;
  return {
    label: PARTY_DECISION_LABELS[result.decision], tone: decisionTone(result.decision), amount,
    icon: refund ? "receipt" : result.decision === "needs_review" ? "warning" : "check",
    headline: amount != null ? money(amount) : result.decision === "needs_review" ? "Awaiting human review" : refund ? "Refund approved" : "The charge stands",
    suffix: amount != null ? "back to the rider" : "",
    checklistTitle: amount != null ? `Why the rider gets ${money(amount)}` : result.decision === "needs_review" ? "Why a human needs to decide" : refund ? "Why the refund is approved" : "Why the charge stands",
    summary: rulingSummary(result),
  };
}

/** Preserve the engine's order, wording, values and IDs, including unmet checks. */
export function rulingConditions(result: Pick<Resolution, "conditions">) {
  return (result.conditions ?? []).map(check => ({ ...check, symbol: check.met ? "✓" : "⊖", tone: check.met ? "ok" : "neutral", status: check.met ? "Met" : "Not met" }));
}

/**
 * The checks that decided the outcome first, then everything else the rules also checked
 * (the safety, fraud, precedent and confidence overlays, and base checks that didn't apply).
 * Empty groups are left out; with no deciding checks the rest reads "Checked by the rules".
 */
export function rulingConditionGroups(result: Pick<Resolution, "conditions" | "policy_refs" | "decision">) {
  const { deciding, others } = conditionGroups(result);
  return [
    { key: "deciding", title: "Decided the case", checks: rulingConditions({ conditions: deciding }) },
    { key: "others", title: deciding.length ? "Also checked" : "Checked by the rules", checks: rulingConditions({ conditions: others }) },
  ].filter(group => group.checks.length > 0);
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
