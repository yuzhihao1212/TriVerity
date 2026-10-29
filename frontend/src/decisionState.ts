// The reviewer's decision on a ruling: pure state shared by the sticky decision bar and
// the "Your decision" card, so both behave the same.

import { decisionTone, type OutcomeTone } from "./outcomeTone";
import type { Decision } from "./types";

export type FinalDecision = Exclude<Decision, "needs_review">;
export const FINAL_LABELS: Record<FinalDecision, string> = {
  partial_refund: "Partial refund", full_refund: "Full refund", compensation: "Compensation", no_action: "No change to the charge",
};

/** What was saved: accepting the ruling, overriding it, or deciding an escalated case. */
export interface SavedDecision { kind: "accepted" | "overridden" | "decided"; decision: FinalDecision; precedentId: string; reason?: string }

/** The outcome in words, with its amount and tone, e.g. "Partial refund · $6.30". */
export function outcomeLine(decision: Decision, refund: number | null): { label: string; amount: string | null; tone: OutcomeTone } {
  const tone = decisionTone(decision);
  const amount = refund != null && refund > 0 && tone === "ok" ? `$${refund.toFixed(2)}` : null;
  if (decision === "needs_review") return { label: "Escalated: needs your decision", amount: null, tone };
  if (decision === "no_action") return { label: "No change to the charge", amount: null, tone };
  return { label: FINAL_LABELS[decision], amount, tone };
}

export function savedText(saved: SavedDecision): string {
  const verb = saved.kind === "accepted" ? "Accepted" : saved.kind === "overridden" ? "Overridden" : "Decided";
  const what = saved.kind === "accepted" ? "" : `: ${FINAL_LABELS[saved.decision].toLowerCase()}`;
  return `✓ ${verb}${what} · saved as precedent ${saved.precedentId}`;
}

export type BarState = "idle" | "saving" | "accepted" | "overridden" | "decided" | "escalated" | "unavailable";
export type BarAction = "accept" | "override" | "decide";

export interface BarView {
  state: BarState;
  label: string;
  amount: string | null;
  tone: OutcomeTone;
  /** Shown in place of the outcome once a decision is saved or recording is off. */
  note: string | null;
  actions: BarAction[];
  disabled: boolean;
}

export function decisionBar({ decision, refund, busy, saved, unavailable }: {
  decision: Decision; refund: number | null; busy: boolean; saved: SavedDecision | null; unavailable: boolean;
}): BarView {
  const outcome = outcomeLine(decision, refund);
  const base = { label: outcome.label, amount: outcome.amount, tone: outcome.tone };
  if (saved) return { ...base, state: saved.kind, note: savedText(saved), actions: [], disabled: true };
  if (unavailable) return { ...base, state: "unavailable", note: "Decisions are disabled in the public demo", actions: [], disabled: true };
  const actions: BarAction[] = decision === "needs_review" ? ["decide"] : ["accept", "override"];
  if (busy) return { ...base, state: "saving", note: null, actions, disabled: true };
  return { ...base, state: decision === "needs_review" ? "escalated" : "idle", note: null, actions, disabled: false };
}

/** Neutral prompt for the reason box: it must not suggest an outcome or an argument. */
export const REASON_PLACEHOLDER = "Explain your decision in one or two sentences: which facts did you rely on?";

/** Both fields are required; nothing is preselected, so the reviewer chooses without a nudge. */
export function decisionErrors(choice: FinalDecision | null, reason: string): { outcome: string | null; reason: string | null } {
  return {
    outcome: choice ? null : "Choose an outcome.",
    reason: reason.trim() ? null : "Give a reason for your decision.",
  };
}

/**
 * What the confidence means here. An escalated case goes to a human because of a rule, whatever
 * the confidence, so it never says "decide automatically"; it names the rules that sent it.
 */
export function confidenceNote(decision: Decision, percent: number, policyRefs: string[]): string {
  if (decision === "needs_review") {
    // Rule IDs arrive as "SAFE-1: Any threatening message …"; keep the ID only (as policyIds does).
    const rules = [...new Set(policyRefs.filter(ref => /human|escalat/i.test(ref)).map(ref => ref.split(":", 1)[0].trim()).filter(Boolean))];
    return rules.length ? `Sent to a human by ${rules.join(" and ")}, whatever the confidence` : "Sent to a human reviewer, whatever the confidence";
  }
  return percent >= 60 ? "Clear enough to decide automatically" : "Below 60%: a human decides";
}
