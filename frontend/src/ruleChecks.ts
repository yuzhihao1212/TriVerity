import type { AgentCase, ArgumentReview, RiskLevel, RuleCheck } from "./types";

/** How the Judge read one cited rule, shared by the Hearing and the Ruling tab. */
export const VERDICT: Record<RuleCheck["verdict"], { label: string; level: RiskLevel }> = {
  supports: { label: "Holds for this side", level: "low" },
  // Attention, not danger: danger is kept for threats and high bad-faith risk.
  favours_other_side: { label: "Favours the other side", level: "medium" },
  does_not_apply: { label: "Does not apply", level: "medium" },
};

/** The Judge's check of each rule one party cited, keyed by rule ID (empty when there is no review). */
export function checksFor(reviews: ArgumentReview[] | undefined, party: "rider" | "driver"): Map<string, RuleCheck> {
  const review = reviews?.find(item => item.party === party);
  return new Map((review?.rules ?? []).map(check => [check.rule, check]));
}

/** One line for the Hearing, e.g. "Judge's check: 2 of 3 cited rules hold". Null when nothing was checked. */
export function checkSummary(checks: Map<string, RuleCheck>): string | null {
  if (checks.size === 0) return null;
  const holding = [...checks.values()].filter(check => check.verdict === "supports").length;
  const noun = checks.size === 1 ? "rule" : "rules";
  const verb = checks.size === 1 ? "holds" : "hold";
  return `Judge's check: ${holding} of ${checks.size} cited ${noun} ${verb}`;
}

/** Why a reply is missing: the round was skipped (an opening was not AI), or the AI's reply was dropped by the output checks. */
export function missingReplyText(own: Pick<AgentCase, "source">, other: Pick<AgentCase, "source">): string {
  if (own.source === "llm" && other.source === "llm") {
    return "The AI's reply didn't pass our output checks or arrive in time, so it was left out rather than shown unchecked.";
  }
  return "No reply generated. The rebuttal round runs only when both opening arguments use AI.";
}
