// Plain-language explanations for the jargon in the reviewer console.
// RULES mirrors data/policies/ryde_mock_policy.json; tests/glossary.test.mjs keeps them in sync.

export const RULES: Record<string, string> = {
  "ESC-1": "Any ruling with confidence below 60% is escalated to a human reviewer.",
  "FRAUD-1": "If either party shows a high bad-faith risk, the dispute is escalated to human review.",
  "NS-1": "A no-show fee applies only if the driver arrived within 100 m of the pickup point.",
  "NS-2": "A no-show fee applies only if the driver waited at least 5 minutes after arriving.",
  "NS-3": "A no-show fee applies only if the driver tried to contact the rider through in-app chat.",
  "NS-4": "If the driver's arrival location or waiting time is missing, the dispute is escalated to human review.",
  "PREC-1": "If human reviewers decided at least two closely similar past disputes differently from the policy rules, the dispute is escalated to human review with those precedents.",
  "RD-1": "A route up to 15% longer than expected is within normal tolerance; no refund is due.",
  "RD-2": "A longer route that did not take longer than expected is consistent with avoiding congestion; no refund is due.",
  "RD-3": "A route more than 15% longer than expected that also took longer is treated as an unjustified detour; the fare above the expected fare is refunded.",
  "RD-4": "If expected and actual distance are not both available, the dispute is escalated to human review.",
  "RD-5": "If an unjustified detour (RD-3) also included an unexpected stop of 10 minutes or more during the trip, the rider also receives a $5.00 credit for the lost time, on top of the fare refund.",
  "REF-1": "A refund never exceeds the fare actually charged; a larger computed refund is reduced to the charged fare.",
  "SAFE-1": "Any threatening message in the chat log is escalated to human review, whatever the fare outcome.",
};

export const TERMS: Record<string, string> = {
  precedent: "A similar past dispute and how it was decided. The system checks each ruling against the closest ones for consistency.",
  triage: "The review priority for a dispute sent to a human: safety first, then high bad-faith risk, then the rest.",
  fallback: "An AI step that failed a safety check or timed out was replaced by fixed, deterministic text. The ruling is unaffected.",
  ai: "Written by the AI (Tencent Hy3) and checked before use. AI never decides the outcome; the policy rules do.",
  code: "Computed by deterministic code, not the AI.",
  confidence: "How clear-cut the facts are under the policy. Below 60%, the dispute goes to a human reviewer (ESC-1).",
  counterfactual: "The fact this ruling turned on, and the outcome a different fact would have given.",
};

export function ruleText(id: string): string | undefined {
  return RULES[id.trim().toUpperCase()];
}
