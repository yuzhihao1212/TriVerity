import type { DisputeType } from "./types";
import { CUSTOMER_COPY as COPY } from "./customerCopy";
import { NOTE_LIMIT, type FinalOutcome, type Party, type SentStoreBackend } from "./notifyState";

export function customerName(name?: string | null): string | null { return name?.trim() || null; }
const money = (value: number | null) => value != null && Number.isFinite(value) && value > 0 ? `$${value.toFixed(2)}` : null;

/** Only final outcome and public party fields are used; no internal resolution data. */
export function customerResult(party: Party, outcome: Pick<FinalOutcome, "decision" | "amount">) {
  if (outcome.decision === "needs_review") return { line: COPY.result.review, next: [COPY.next.review], icon: "pause", status: COPY.underReview };
  const amount = money(outcome.amount);
  const refund = outcome.decision === "partial_refund" || outcome.decision === "full_refund";
  const credit = outcome.decision === "compensation";
  const line = party === "driver" ? COPY.result.driver : outcome.decision === "no_action" ? COPY.result.noChange
    : !amount ? COPY.result.pendingAmount : credit ? COPY.result.credit(amount) : COPY.result.refund(amount);
  const next = party === "rider"
    ? refund && amount ? [COPY.next.refund] : credit && amount ? [COPY.next.credit] : [COPY.next.noChange]
    : refund && amount ? [COPY.next.driverRefund(amount), COPY.next.earningsAdjusted]
      : credit && amount ? [COPY.next.driverCredit(amount), COPY.next.earningsAdjusted]
      : outcome.decision === "no_action" ? [COPY.next.earningsUnchanged] : [COPY.next.noChange];
  // "Your rating isn't affected" only once the team confirms it (customerCopy CONFIRMED).
  if (party === "driver" && COPY.next.rating) next.push(COPY.next.rating);
  return { line, next, icon: party === "rider" && refund ? "receipt" : "check", status: COPY.resolved };
}

export interface QuickNote { id: string; label: string; text: string }
export function quickNotes(party: Party, outcome: Pick<FinalOutcome, "decision" | "amount">, name?: string | null, disputeType: DisputeType = "route_deviation"): QuickNote[] {
  const who = customerName(name);
  const amount = money(outcome.amount);
  const refund = ["partial_refund", "full_refund"].includes(outcome.decision);
  if (party === "rider") {
    const q = COPY.quick.rider;
    return [
      ...(outcome.decision === "compensation" || refund ? [{ id: "sorry", label: q.sorry.label, text: q.sorry.text(who) }] : []),
      ...(refund && amount && q.timing.text ? [{ id: "timing", label: q.timing.label, text: q.timing.text(amount) }] : []),
      { id: "thanks", label: q.thanks.label, text: q.thanks.text(who) },
    ];
  }
  const q = COPY.quick.driver;
  return [
    { id: "patience", label: q.patience.label, text: q.patience.text(who) },
    ...(outcome.decision !== "needs_review" ? [{ id: "appeal", label: q.appeal.label, text: q.appeal.text }] : []),
    ...(refund && disputeType === "route_deviation" ? [{ id: "route", label: q.route.label, text: q.route.text(who) }] : []),
  ];
}

/** Remove only the unchanged chip text, preserving the reviewer's own edits. */
export function toggleQuickNote(note: string, text: string): { note: string; refused: boolean } {
  const at = note.indexOf(text);
  if (at >= 0) return { note: `${note.slice(0, at).trimEnd()} ${note.slice(at + text.length).trimStart()}`.trim(), refused: false };
  const next = [note.trim(), text].filter(Boolean).join(" ");
  return next.length > NOTE_LIMIT ? { note, refused: true } : { note: next, refused: false };
}

export function ratingIndex(current: number | null, key: string): number | null {
  if (key === "Home") return 0;
  if (key === "End") return 4;
  if (key === "ArrowRight" || key === "ArrowDown") return current == null ? 0 : (current + 1) % 5;
  if (key === "ArrowLeft" || key === "ArrowUp") return current == null ? 4 : (current + 4) % 5;
  return current;
}
export interface Feedback { rating: number; comment: string }
export function validFeedback(value: unknown): value is Feedback {
  if (!value || typeof value !== "object") return false;
  const item = value as Feedback;
  return Number.isInteger(item.rating) && item.rating >= 0 && item.rating <= 4 && typeof item.comment === "string" && item.comment.length <= NOTE_LIMIT;
}

/** Session storage is injected; memory remains usable when storage is blocked. */
export function createFeedbackStore(storage?: SentStoreBackend | null) {
  const memory = new Map<string, Feedback>();
  return {
    get(key: string): Feedback | null {
      if (memory.has(key)) return { ...memory.get(key)! };
      try {
        const value: unknown = JSON.parse(storage?.getItem(`triverity.feedback.${key}`) ?? "null");
        if (validFeedback(value)) { memory.set(key, value); return { ...value }; }
      } catch { /* Blocked or corrupt storage: no saved feedback. */ }
      return null;
    },
    set(key: string, value: Feedback): boolean {
      if (!validFeedback(value)) return false;
      memory.set(key, { ...value });
      try { storage?.setItem(`triverity.feedback.${key}`, JSON.stringify(value)); } catch { /* Session memory only. */ }
      return true;
    },
  };
}
