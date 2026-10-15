// One source of truth for what an outcome MEANS, in colour and words. No imports, so
// every module (and every test) can use it directly.
//
//   ok      an outcome in a party's favour: refund or compensation
//   warn    needs attention: escalated to a human
//   neutral factual: no change to the charge
// (danger is reserved for real problems, e.g. threats and high bad-faith risk; brand
//  red stays for identity, navigation, selection and primary actions.)

import type { Decision } from "./types";

export type OutcomeTone = "ok" | "warn" | "neutral";
export type Tone = OutcomeTone | "danger";

export function decisionTone(decision: Decision): OutcomeTone {
  if (decision === "partial_refund" || decision === "full_refund" || decision === "compensation") return "ok";
  if (decision === "needs_review") return "warn";
  return "neutral";
}

/** Bad-faith risk (and anything shown on the same scale): danger only when high. */
export function riskTone(level: "low" | "medium" | "high"): Tone {
  return level === "high" ? "danger" : level === "medium" ? "warn" : "neutral";
}

/** Short labels, used in the sidebar, the precedent list and agent text. */
export const DECISION_LABELS: Record<Decision, string> = {
  partial_refund: "Partial refund",
  full_refund: "Full refund",
  compensation: "Compensation",
  no_action: "No action",
  needs_review: "Needs human review",
};

export function decisionLabel(decision: string): string {
  return Object.hasOwn(DECISION_LABELS, decision) ? DECISION_LABELS[decision as Decision] : decision.replace(/_/g, " ");
}
