// The reviewer's decision on a ruling: pure state shared by the sticky decision bar and
// the "Your decision" card, so both behave the same.

import { decisionTone, type OutcomeTone } from "./outcomeTone";
import type { Decision } from "./types";

export type FinalDecision = Exclude<Decision, "needs_review">;
export const FINAL_LABELS: Record<FinalDecision, string> = {
  partial_refund: "Partial refund", full_refund: "Full refund", compensation: "Compensation", no_action: "No change to the charge",
};

/** What was saved: accepting the ruling, overriding it, deciding an escalated case, or auto-resolved by policy. */
export interface SavedDecision { kind: "accepted" | "overridden" | "decided" | "auto"; decision: FinalDecision; precedentId: string; reason?: string; amount?: number; at?: string }

/** The outcomes a reviewer can override to: no compensation for now, and never "needs review" (they are the human). */
export type OverrideChoice = "partial_refund" | "full_refund" | "no_action" | "investigate";
export const OVERRIDE_LABELS: Record<OverrideChoice, string> = {
  partial_refund: "Partial refund", full_refund: "Full refund", no_action: "No change to the charge", investigate: "Needs further investigation",
};
/** What a reviewer can ask a second reviewer to check. */
export const INVESTIGATION_CHECKS = ["GPS data looks wrong", "Missing chat or call records", "Possible fraud pattern", "Safety concern"] as const;
export const MIN_REASON = 10;
export const MIN_PARTIAL = 0.5;
/** A partial refund above this multiple of the ruling's refund needs a second reviewer. */
export const SECOND_APPROVAL_RATIO = 1.5;
/** With no refund in the ruling, a refund above this needs a second reviewer (the auto-resolve cap). */
export const SECOND_APPROVAL_NO_REFUND = 10;

/** A case put on hold for a second reviewer (simulated in this browser session). */
export interface HoldRecord { disputeId: string; why: string; reason: string; amount: number | null; at: string }

/**
 * The override choices for a ruling: the ruling's own outcome is left out, except a partial
 * refund, which can be changed to another amount.
 */
export function overrideChoices(decision: Decision): OverrideChoice[] {
  return (Object.keys(OVERRIDE_LABELS) as OverrideChoice[]).filter(choice =>
    decision === "needs_review" || choice !== decision || choice === "partial_refund");
}

export interface AmountCheck { value: number | null; state: "ok" | "second" | "empty" | "low" | "high"; message: string }

/**
 * A partial refund amount: at least $0.50, never above the fare charged (REF-1). Above the
 * second-approval limit (secondApprovalLimit) a second reviewer must approve it.
 */
export function checkPartialAmount(text: string, fare: number | null, ruling: number | null): AmountCheck {
  // A $0.00 fare leaves nothing to refund: say that, rather than asking for an impossible amount.
  if (fare != null && fare <= 0) return { value: null, state: "high", message: `The fare charged was $0.00, so there is nothing to refund (rule REF-1). Choose "No change to the charge".` };
  const trimmed = text.trim().replace(/^\$/, "");
  if (!trimmed) return { value: null, state: "empty", message: "Enter the refund amount." };
  const value = Number(trimmed);
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed) || !Number.isFinite(value)) return { value: null, state: "empty", message: "Enter an amount such as 8.00." };
  if (value < MIN_PARTIAL) return { value: null, state: "low", message: `The smallest refund is $${MIN_PARTIAL.toFixed(2)}. For nothing back, choose "No change to the charge".` };
  if (fare != null && value > fare + 1e-9) return { value: null, state: "high", message: `A refund can't be more than the $${fare.toFixed(2)} fare charged (rule REF-1). For all of it, choose "Full refund".` };
  return limitCheck(value, ruling);
}

/**
 * The refund one reviewer may give alone: 1.5 times the ruling's refund, or $10 when the ruling
 * gives none. The amount counts, whichever outcome produced it (partial or full refund).
 */
export function secondApprovalLimit(ruling: number | null): number {
  return ruling != null && ruling > 0 ? Math.round(ruling * SECOND_APPROVAL_RATIO * 100) / 100 : SECOND_APPROVAL_NO_REFUND;
}

function limitCheck(value: number, ruling: number | null): AmountCheck {
  const limit = secondApprovalLimit(ruling);
  if (value <= limit + 1e-9) return { value, state: "ok", message: "Within your limit. You can decide this on your own." };
  const why = ruling != null && ruling > 0 ? `More than ${SECOND_APPROVAL_RATIO}× the ruling's $${ruling.toFixed(2)}`
    : `More than $${limit.toFixed(2)} when the ruling gives no refund`;
  return { value, state: "second", message: `${why}. A second reviewer must approve it before anyone is notified.` };
}

/** The amount an override would refund, checked against the same limit: partial (entered) or full (the fare). */
export function overrideAmountCheck(choice: OverrideChoice | null, text: string, fare: number | null, ruling: number | null): AmountCheck | null {
  if (choice === "partial_refund") return checkPartialAmount(text, fare, ruling);
  if (choice === "full_refund" && fare != null) return limitCheck(fare, ruling);
  return null;
}

/** What blocks confirming an override, in the order the reviewer fills the form. */
export function overrideError({ choice, check, reason, amount }: {
  choice: OverrideChoice | null; check: string | null; reason: string; amount: AmountCheck | null;
}): string | null {
  if (!choice) return "Choose what should happen instead.";
  if (choice === "partial_refund" && (!amount || amount.value == null)) return amount?.message ?? "Enter the refund amount.";
  if (choice === "investigate" && !check) return "Choose what needs checking.";
  if (reason.trim().length < MIN_REASON) return "Add a short reason. It's kept with the case and the precedent.";
  return null;
}

/** "$6.30 back to the rider", "No change to the charge", "Needs a person": the ruling in one line. */
export function rulingLine(decision: Decision, refund: number | null): string {
  if (decision === "needs_review") return "Sent to you to decide";
  if (decision === "no_action") return "No change to the charge";
  if (refund != null && refund > 0) return decision === "compensation" ? `$${refund.toFixed(2)} credit to the rider` : `$${refund.toFixed(2)} back to the rider`;
  return FINAL_LABELS[decision];
}

/** The reviewer's override in one line, for the comparison card and the result. */
export function overrideLine(choice: OverrideChoice, amount: number | null, fare: number | null): string {
  if (choice === "partial_refund") return amount != null ? `$${amount.toFixed(2)} back to the rider` : "Partial refund";
  if (choice === "full_refund") return fare != null ? `$${fare.toFixed(2)} back to the rider` : "Full refund";
  if (choice === "no_action") return "No change to the charge";
  return "On hold for investigation";
}

/** The outcome in words, with its amount and tone, e.g. "Partial refund · $6.30". */
export function outcomeLine(decision: Decision, refund: number | null): { label: string; amount: string | null; tone: OutcomeTone } {
  const tone = decisionTone(decision);
  const amount = refund != null && refund > 0 && tone === "ok" ? `$${refund.toFixed(2)}` : null;
  if (decision === "needs_review") return { label: "Escalated: needs your decision", amount: null, tone };
  if (decision === "no_action") return { label: "No change to the charge", amount: null, tone };
  return { label: FINAL_LABELS[decision], amount, tone };
}

export function holdText(hold: HoldRecord): string {
  return `On hold for a second reviewer · ${hold.why}`;
}

export function savedText(saved: SavedDecision): string {
  const verb = saved.kind === "accepted" ? "Accepted" : saved.kind === "overridden" ? "Overridden" : saved.kind === "auto" ? "Auto-resolved" : "Decided";
  const what = saved.kind === "accepted" || saved.kind === "auto" ? "" : `: ${FINAL_LABELS[saved.decision].toLowerCase()}`;
  const precedent = saved.kind === "auto" ? "no precedent (policy decision)" : `saved as precedent ${saved.precedentId}`;
  return `✓ ${verb}${what} · ${precedent}`;
}

export type BarState = "idle" | "saving" | "accepted" | "overridden" | "decided" | "auto" | "escalated" | "unavailable" | "held";
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

export function decisionBar({ decision, refund, busy, saved, unavailable, hold = null }: {
  decision: Decision; refund: number | null; busy: boolean; saved: SavedDecision | null; unavailable: boolean; hold?: HoldRecord | null;
}): BarView {
  const outcome = outcomeLine(decision, refund);
  const base = { label: outcome.label, amount: outcome.amount, tone: outcome.tone };
  if (saved) return { ...base, state: saved.kind, note: savedText(saved), actions: [], disabled: true };
  if (hold) return { ...base, tone: "warn", state: "held", note: holdText(hold), actions: [], disabled: true };
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
