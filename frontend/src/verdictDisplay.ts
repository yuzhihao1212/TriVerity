import { confidenceNote } from "./decisionState";
import { bottomLine, withoutCitations } from "./hearingDisplay";
import { decisionTone } from "./outcomeTone";
import { PARTY_DECISION_LABELS } from "./partyView";
import { money } from "./presentation";
import { appliedRuleIds, conditionGroups, OVERLAY_RULES } from "./rulingDetails";
import type { FinalHeaderOutcome } from "./stepVisuals";
import type { DisputeCase, Resolution } from "./types";

export const CONFIDENCE_HELP = "Confidence describes how clearly the available facts meet the policy rule. It is set by the rule that applied, not an AI prediction or a probability that the ruling is correct. Safety and other escalation rules can still require human review.";

export function confidenceDisplay(result: Pick<Resolution, "confidence" | "min_confidence" | "decision" | "policy_refs" | "autonomy">) {
  const percent = Math.round(result.confidence * 100);
  const threshold = result.min_confidence;
  const known = typeof threshold === "number" && Number.isFinite(threshold) && threshold >= 0 && threshold <= 1;
  const thresholdPercent = known ? threshold * 100 : null;
  const thresholdLabel = thresholdPercent == null ? null : `${Number(thresholdPercent.toFixed(2))}%`;
  // An escalated case goes to a person whatever the number, so its bar takes no pass/fail colour.
  const tone = !known || result.decision === "needs_review" ? "neutral" : result.confidence >= threshold ? "ok" : "warn";
  const caption = result.decision === "needs_review" ? confidenceNote(result.decision, percent, result.policy_refs)
    : !known ? "Automatic-decision threshold unavailable in this result."
    : result.confidence < threshold ? `Below the ${thresholdLabel} minimum, so a human reviewer decides.`
    // Two thresholds: the rules may decide at the minimum, but only cases within the stricter
    // auto-resolve limits close without a person (the reasons are listed under the ruling).
    : result.autonomy?.eligible && !result.autonomy.audit ? "High enough, and within the limits, to close automatically."
    : `${result.confidence === threshold ? "At" : "Above"} the ${thresholdLabel} minimum: the rules decide, and a person confirms.`;
  const label = known && result.confidence < threshold ? "Low Confidence" : "Confidence";
  return { percent, thresholdPercent, thresholdLabel, tone, caption, label };
}

const TRIGGER_WORDS: Record<string, string> = {
  "SAFE-1": "a threatening message in the chat",
  "FRAUD-1": "a high bad-faith risk",
  "PREC-1": "contrary reviewer decisions on similar cases",
  "ESC-1": "confidence below the minimum",
};

const listWords = (items: string[]) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
const firstUpper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Why FRAUD-1 fired: the signals of whichever party rated high, as the backend worded them. */
function riskReasons({ risk }: Partial<Pick<Resolution, "risk">>, fraudFired: boolean): string[] {
  if (!risk || !fraudFired) return [];
  const high = [risk.rider_risk === "high" && "Rider", risk.driver_risk === "high" && "Driver"].filter(Boolean) as string[];
  return risk.signals.filter(signal => high.some(party => signal.startsWith(party)));
}

/**
 * The Ruling at a glance, in plain words: why this outcome, what the rules established, and
 * what would settle or change it. Only rearranges what the engine supplied.
 */
export function rulingBrief(result: Pick<Resolution, "decision" | "policy_refs" | "conditions" | "recommended_action" | "counterfactuals"> & Partial<Pick<Resolution, "risk">>) {
  const applied = appliedRuleIds(result.policy_refs);
  const checks = rulingConditions(result);
  const base = checks.filter(check => !OVERLAY_RULES.test(check.rule));
  const review = result.decision === "needs_review";
  const change = result.counterfactuals?.[0];
  const changeLine = change ? `If ${change.change}, the outcome would be ${change.outcome}.` : null;
  const known = review
    ? base.filter(check => check.met && !/available$/i.test(check.label))
    : base.filter(check => applied.includes(check.rule) && !/available$/i.test(check.label));
  if (!review) return { reason: rulingSummary(result), knownTitle: "What the Rules Found", known, missing: null, triggers: [], riskReasons: [], proposed: null, changeLine };
  const triggers = checks.filter(check => OVERLAY_RULES.test(check.rule) && check.met && applied.includes(check.rule));
  const gap = /^Escalate to a human reviewer: (.+?)\.?$/.exec(result.recommended_action)?.[1] ?? null;
  const proposed = /\(proposed: (.+?)\.?\)$/.exec(result.recommended_action)?.[1] ?? null;
  const words = triggers.flatMap(check => TRIGGER_WORDS[check.rule] ? [TRIGGER_WORDS[check.rule]] : []);
  const reason = gap ? `The system can't rule on this case, because ${gap}.`
    : words.length ? `The system can't close this case, because of ${listWords(words)}.`
    : rulingSummary(result);
  const missing = gap ? { fact: firstUpper(gap.replace(/\s+(?:is|are)\s+(?:missing|incomplete)$/i, "")), changeLine } : null;
  return { reason, knownTitle: "What We Know", known, missing, triggers, riskReasons: riskReasons(result, triggers.some(check => check.rule === "FRAUD-1")), proposed, changeLine };
}

/** What each side asks for: their opening sentence. Template text isn't a position, so AI runs only. */
export function rulingSides(result: Pick<Resolution, "decision" | "rider_case" | "driver_case">) {
  if (result.decision !== "needs_review" || result.rider_case.source !== "llm" || result.driver_case.source !== "llm") return null;
  const ask = (summary: string) => withoutCitations(bottomLine(summary).first);
  const rider = ask(result.rider_case.summary), driver = ask(result.driver_case.summary);
  return rider && driver ? { rider, driver } : null;
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
    headline: amount != null ? money(amount) : result.decision === "needs_review" ? "You Decide This Case" : refund ? "Refund Approved" : "The Charge Stands",
    // A case waiting on the reviewer needs no label above the headline: it would say the same thing.
    solo: result.decision === "needs_review",
    suffix: amount != null ? "back to the rider" : "",
    checklistTitle: amount != null ? `Why the rider gets ${money(amount)}` : result.decision === "needs_review" ? "Why a Human Needs to Decide" : refund ? "Why the Refund Is Approved" : "Why the charge stands",
    summary: rulingSummary(result),
  };
}

/** Once a person has decided, the hero shows that decision; the checks below stay as the rules' own result. */
export function decidedHero(hero: ReturnType<typeof rulingHero>, final: FinalHeaderOutcome | null): ReturnType<typeof rulingHero> {
  if (!final?.by) return hero;
  const refund = decisionTone(final.decision) === "ok";
  const amount = refund && final.amount != null ? final.amount : null;
  return {
    ...hero,
    label: final.by === "decided" ? "Reviewer Decided" : "Reviewer Overrode the Rules",
    tone: decisionTone(final.decision), amount,
    icon: refund ? "receipt" : "check",
    headline: amount != null ? money(amount) : PARTY_DECISION_LABELS[final.decision],
    solo: false,
    suffix: amount != null ? "back to the rider" : "",
    checklistTitle: final.by === "decided" ? "Why a Human Needed to Decide" : "What the Rules Found",
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
  // What didn't apply stays visible (e.g. "6 min stop, so no credit"); only the safety, fraud,
  // precedent and confidence checks, which rarely trigger, fold.
  const rules = others.filter(check => !OVERLAY_RULES.test(check.rule));
  const overlays = others.filter(check => OVERLAY_RULES.test(check.rule));
  return [
    { key: "deciding", title: "Decided the Case", checks: rulingConditions({ conditions: deciding }) },
    { key: "others", title: deciding.length ? "Also Checked" : "Checked by the rules", checks: rulingConditions({ conditions: rules }) },
    { key: "overlays", title: "Safety, Fraud, Precedent and Confidence Checks", checks: rulingConditions({ conditions: overlays }) },
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

export function rulingCredits(result: Pick<Resolution, "explanation_source" | "rider_case" | "driver_case">, aiLive = false): { source: "llm" | "fallback"; text: string; warn?: boolean } {
  const rider = result.rider_case.source === "llm", driver = result.driver_case.source === "llm", judge = result.explanation_source === "llm";
  if (rider && driver && judge) return { source: "llm", text: "Hy3 wrote the arguments and this explanation." };
  // The pill says AI Live, so a result without any AI has to say so plainly.
  if (!rider && !driver && !judge) return { source: "fallback", warn: aiLive, text: aiLive
    ? "AI Live is on, but this result used fallback text. Re-run to try Hy3."
    : "Checked fallback text supplies the arguments and explanation." };
  return { source: "llm", text: "Hy3 and checked fallback text supplied these steps." };
}
