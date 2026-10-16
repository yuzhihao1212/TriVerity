// Notify parties: the gate, the locked outcome and amount, the suggested wording, the privacy
// check and the "sent" record. Pure apart from the storage handed to the sent store.

import type { FinalDecision, SavedDecision } from "./decisionState";
import { PARTY_DECISION_LABELS } from "./partyView";
import type { Decision, DisputeCase, Resolution } from "./types";

export type Party = "rider" | "driver";
export const PARTIES: Party[] = ["rider", "driver"];
/** RD-5: the credit for the lost time. */
export const COMPENSATION_CREDIT = 5;

/**
 * The editors open only after the reviewer accepted or overrode the ruling. In the public
 * demo (decisions unavailable, 403), opening the Ruling step is enough, matching the
 * Ruling-tick fallback.
 */
export function notifyGate({ saved, unavailable, rulingVisited }: { saved: boolean; unavailable: boolean; rulingVisited: boolean }): "open" | "locked" {
  return saved || (unavailable && rulingVisited) ? "open" : "locked";
}

/** The most a refund can be (REF-1): the fare actually charged (the no-show fee for a no-show). */
export function maxRefund(dispute: Pick<DisputeCase, "fare">): number | null {
  const charged = dispute.fare?.actual ?? dispute.fare?.cancellation_fee;
  return typeof charged === "number" && Number.isFinite(charged) && charged > 0 ? charged : null;
}

export interface FinalOutcome {
  decision: Decision;
  label: string;
  /** null: no amount shown (no action, escalated). */
  amount: number | null;
  /** A partial-refund override: the reviewer enters the amount. */
  needsAmount: boolean;
  source: "ruling" | "override";
}

/**
 * The outcome and amount the parties are told: always from the final decision, never edited
 * here. Accepted (or no decision recorded, in the public demo): the ruling's own. Overridden:
 * no action -> none; full refund -> the charged fare; compensation -> $5.00 (RD-5);
 * partial refund -> the amount the reviewer enters.
 */
export function finalOutcome(resolution: Pick<Resolution, "decision" | "refund_amount">, saved: Pick<SavedDecision, "kind" | "decision"> | null,
  dispute: Pick<DisputeCase, "fare">, partialAmount: number | null = null): FinalOutcome {
  if (!saved || saved.kind === "accepted") {
    const refunds = ["partial_refund", "full_refund", "compensation"].includes(resolution.decision);
    return { decision: resolution.decision, label: PARTY_DECISION_LABELS[resolution.decision],
      amount: refunds ? resolution.refund_amount : null, needsAmount: false, source: "ruling" };
  }
  const decision: FinalDecision = saved.decision;
  const base = { decision, label: PARTY_DECISION_LABELS[decision], source: "override" as const };
  if (decision === "no_action") return { ...base, amount: null, needsAmount: false };
  if (decision === "full_refund") return { ...base, amount: maxRefund(dispute), needsAmount: false };
  if (decision === "compensation") return { ...base, amount: COMPENSATION_CREDIT, needsAmount: false };
  return { ...base, amount: partialAmount, needsAmount: true };
}

/** The partial-refund amount: required, $0.01 up to the charged fare (REF-1), at most 2 decimals. */
export function validateAmount(text: string, max: number | null): { ok: true; value: number } | { ok: false; message: string } {
  const range = max != null ? `between $0.01 and $${max.toFixed(2)}` : "of at least $0.01";
  const message = `Enter a refund ${range}. A refund never exceeds the fare charged (REF-1).`;
  const trimmed = text.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { ok: false, message: trimmed ? message : `A partial refund needs an amount. ${message}` };
  const value = Number(trimmed);
  if (value < 0.01 || (max != null && value > max + 1e-9)) return { ok: false, message };
  return { ok: true, value };
}

const money = (value: number) => `$${value.toFixed(2)}`;

/**
 * The suggested message. Accepted: the ruling's own explanation for that party. Overridden
 * or decided by the reviewer: plain wording for the final outcome, so it never contradicts it.
 */
export function suggestedMessage(party: Party, resolution: Pick<Resolution, "rider_explanation" | "driver_explanation">,
  outcome: Pick<FinalOutcome, "decision" | "amount" | "source">): string {
  if (outcome.source === "ruling") return party === "rider" ? resolution.rider_explanation : resolution.driver_explanation;
  const amount = outcome.amount != null ? money(outcome.amount) : "the approved amount";
  const rider: Record<string, string> = {
    partial_refund: `A reviewer looked at your dispute and approved a partial refund of ${amount}. It goes back to your original payment method.`,
    full_refund: `A reviewer looked at your dispute and approved a full refund of ${amount}. It goes back to your original payment method.`,
    compensation: `A reviewer looked at your dispute and approved a ${amount} credit for the lost time.`,
    no_action: "A reviewer looked at your dispute. The charge was correct, so it stays as it is.",
  };
  const driver: Record<string, string> = {
    partial_refund: `A reviewer looked at this trip's dispute. The rider receives a partial refund of ${amount}.`,
    full_refund: `A reviewer looked at this trip's dispute. The rider receives a full refund of ${amount}.`,
    compensation: `A reviewer looked at this trip's dispute. The rider receives a ${amount} credit for the lost time.`,
    no_action: "A reviewer looked at this trip's dispute. The charge stays as it is; nothing changes for you.",
  };
  return (party === "rider" ? rider : driver)[outcome.decision] ?? (party === "rider" ? resolution.rider_explanation : resolution.driver_explanation);
}

// ---- Privacy check -------------------------------------------------------------

const INTERNAL_TERMS: { re: RegExp; label: string }[] = [
  { re: /\bfraud\b(?!-\d)/i, label: "fraud" }, // "FRAUD-1" is reported as a rule ID
  { re: /\bbad[- ]faith\b/i, label: "bad faith" },
  { re: /\brisk score\b/i, label: "risk score" },
  { re: /\brisk(?! score)\b/i, label: "risk" },
  { re: /\bsignals?\b/i, label: "signals" },
  { re: /\bprevious disputes?\b/i, label: "previous disputes" },
  { re: /\bhistory\b/i, label: "history" },
  { re: /\bprecedents?\b/i, label: "precedent" },
  { re: /\b(?:TRIP|GPS|FARE|CHAT|HIST)-\d+\b/, label: "evidence IDs" },
  { re: /\b(?:FRAUD|SAFE|ESC)-\d+\b/, label: "internal rule IDs" },
];

/** Internal wording the parties must never see, in the order found. Empty means clean. */
export function privacyWarnings(text: string): string[] {
  return INTERNAL_TERMS.filter(term => term.re.test(text)).map(term => term.label);
}

// ---- Sent record ------------------------------------------------------------------

export interface SentRecord { at: string; edited: boolean; messages: Record<Party, string>; decision: Decision; amount: number | null }
export interface SentStoreBackend { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const SENT_KEY = "triverity.sent";

/** "Approve & send" per review key: sessionStorage when available, always an in-memory map. */
export function createSentStore(storage?: SentStoreBackend | null) {
  const memory = new Map<string, SentRecord>();
  const readAll = (): Record<string, SentRecord> => {
    try { const parsed = JSON.parse(storage?.getItem(SENT_KEY) ?? "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
    catch { return {}; }
  };
  return {
    get(key: string): SentRecord | null { return memory.get(key) ?? readAll()[key] ?? null; },
    set(key: string, record: SentRecord): void {
      memory.set(key, record);
      try {
        const all = readAll(); all[key] = record;
        const keys = Object.keys(all);
        for (const old of keys.slice(0, Math.max(0, keys.length - 100))) delete all[old];
        storage?.setItem(SENT_KEY, JSON.stringify(all));
      } catch { /* Storage blocked or full: memory still holds. */ }
    },
  };
}

/** "08:42" from a Date, in the reviewer's own time. */
export function clockText(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** "✓ Sent to rider and driver · 08:42 · edited by reviewer" (or "· as suggested"). */
export function sentText(record: Pick<SentRecord, "at" | "edited">): string {
  return `✓ Sent to rider and driver · ${record.at} · ${record.edited ? "edited by reviewer" : "as suggested"}`;
}

export const SEND_TOOLTIP = "Simulated: this prototype sends no real message to the rider or driver.";
