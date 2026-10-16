// Notify parties: the gate, the locked outcome and amount, the suggested wording, the privacy
// check and the "sent" record. Pure apart from the storage handed to the sent store.

import type { FinalDecision, SavedDecision } from "./decisionState";
import { DECISION_LABELS } from "./outcomeTone";
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
 * The generated message, read-only: exactly what the party sees. Accepted: the ruling's own
 * explanation for that party. Overridden or decided by the reviewer: plain wording for the
 * final outcome, so it never contradicts it. The reviewer can only add a note under it.
 */
export function generatedMessage(party: Party, resolution: Pick<Resolution, "rider_explanation" | "driver_explanation">,
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

// ---- Reviewer notes ----------------------------------------------------------------

/** The most a reviewer note can hold. */
export const NOTE_LIMIT = 280;
export const NOTE_PLACEHOLDER = "Optional: a personal note, such as an apology or next steps";

/** "120 / 280". */
export function noteCounter(note: string): string {
  return `${note.length} / ${NOTE_LIMIT}`;
}

/** A note as stored and shown: trimmed, at most NOTE_LIMIT characters; "" means no note. */
export function cleanNote(note: string): string {
  return note.trim().slice(0, NOTE_LIMIT);
}

/**
 * The privacy check runs on the reviewer's notes only: the generated message is the system's
 * own party-safe wording and is never checked or blocked.
 */
export function noteWarnings(notes: Record<Party, string>): Record<Party, string[]> {
  return { rider: privacyWarnings(notes.rider), driver: privacyWarnings(notes.driver) };
}

/** Why "Approve & send" is blocked, or null when it can go. */
export function sendBlock({ amountMissing, warnings, sendAnyway }: {
  amountMissing: boolean; warnings: Record<Party, string[]>; sendAnyway: boolean;
}): "amount" | "privacy" | null {
  if (amountMissing) return "amount";
  if (PARTIES.some(party => warnings[party].length) && !sendAnyway) return "privacy";
  return null;
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

/** What was sent: the generated message and the reviewer's note (empty: none) per party. */
export interface SentRecord { at: string; messages: Record<Party, string>; notes: Record<Party, string>; decision: Decision; amount: number | null; disputeId?: string; reviewer?: SavedDecision; correction?: boolean; timestamp?: string }
export interface SentStoreBackend { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const SENT_KEY = "triverity.sent";

export type ReviewEvent = ({ type: "sent" } & SentRecord) | { type: "reopened"; at: string; timestamp?: string };
export const CASE_HISTORY_KEY = "triverity.caseHistory";
export const REVIEW_RESULTS_KEY = "triverity.reviewResults";
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** Append-only history; SENT_KEY is read solely to migrate records from the earlier UI. */
export function createSentStore(storage?: SentStoreBackend | null) {
  const memory = new Map<string, ReviewEvent[]>();
  const resultMemory = new Map<string, Resolution>();
  const readObject = (key: string): Record<string, unknown> => {
    try { const parsed = JSON.parse(storage?.getItem(key) ?? "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
    catch { return {}; }
  };
  const results = (): Record<string, Resolution> => {
    const restored: Record<string, Resolution> = {};
    for (const [id, candidate] of Object.entries(readObject(REVIEW_RESULTS_KEY))) {
      const r = candidate as Resolution | null;
      if (r && Array.isArray(r.agent_log) && r.rider_case && r.driver_case && r.risk && Array.isArray(r.judge_evidence)) restored[id] = r;
    }
    for (const [id, result] of resultMemory) restored[id] = result;
    return copy(restored);
  };
  const validSent = (value: unknown): value is SentRecord => {
    const r = value as SentRecord | null;
    return !!r && typeof r.at === "string" && !!r.messages && PARTIES.every(p => typeof r.messages[p] === "string")
      && Object.hasOwn(PARTY_DECISION_LABELS, r.decision) && (r.amount === null || Number.isFinite(r.amount));
  };
  const events = (key: string): ReviewEvent[] => {
    if (memory.has(key)) return copy(memory.get(key)!);
    const stored = readObject(CASE_HISTORY_KEY)[key];
    if (Array.isArray(stored)) {
      const list = stored.filter(event => event && (event.type === "sent" ? validSent(event) : event.type === "reopened" && typeof event.at === "string"));
      memory.set(key, list);
      return copy(list);
    }
    const legacy = readObject(SENT_KEY)[key];
    const list: ReviewEvent[] = validSent(legacy) ? [{ ...copy(legacy), type: "sent" }] : [];
    memory.set(key, list);
    return copy(list);
  };
  const append = (key: string, event: ReviewEvent) => {
    const next = [...events(key), copy(event)];
    memory.set(key, next);
    try {
      const all = readObject(CASE_HISTORY_KEY);
      // Include memory-only writes if a prior write failed (e.g. storage was full).
      for (const [k, list] of memory) all[k] = list;
      storage?.setItem(CASE_HISTORY_KEY, JSON.stringify(all));
    } catch { /* Memory remains authoritative, including reopens, when storage is blocked. */ }
  };
  const get = (key: string): SentRecord | null => {
    const last = events(key).at(-1);
    if (last?.type !== "sent") return null;
    const { type: _type, ...record } = last;
    return record;
  };
  return {
    events, get, results,
    saveResult(disputeId: string, result: Resolution): void {
      resultMemory.set(disputeId, copy(result));
      try { storage?.setItem(REVIEW_RESULTS_KEY, JSON.stringify(results())); } catch { /* Memory keeps the current review and its closed state. */ }
    },
    latest(key: string): SentRecord | null {
      const last = events(key).filter((e): e is ReviewEvent & SentRecord => e.type === "sent").at(-1);
      if (!last) return null;
      const { type: _type, ...record } = last;
      return record;
    },
    reopened(key: string): boolean { return events(key).at(-1)?.type === "reopened"; },
    set(key: string, record: SentRecord): void {
      if (get(key)) return; // A closed review cannot send again until deliberately reopened.
      const id = record.disputeId ?? (key.includes("|") ? key.slice(0, key.indexOf("|")) : null);
      const keys = new Set([...Object.keys(readObject(SENT_KEY)), ...Object.keys(readObject(CASE_HISTORY_KEY)), ...memory.keys()]);
      const correction = events(key).some(e => e.type === "sent") || (id != null && [...keys].some(k => k !== key && k.startsWith(`${id}|`) && events(k).some(e => e.type === "sent")));
      append(key, { ...record, ...(correction ? { correction: true } : {}), type: "sent" });
    },
    reopen(key: string, at: string, timestamp?: string): boolean {
      if (!get(key)) return false;
      append(key, { type: "reopened", at, timestamp });
      return true;
    },
    earlier(disputeId: string, currentKey: string): { key: string; events: ReviewEvent[] }[] {
      const keys = new Set([...Object.keys(readObject(SENT_KEY)), ...Object.keys(readObject(CASE_HISTORY_KEY)), ...memory.keys()]);
      return [...keys].filter(key => key !== currentKey && key.startsWith(`${disputeId}|`))
        .map(key => ({ key, events: events(key) })).filter(item => item.events.some(e => e.type === "sent"));
    },
  };
}

/** The delivered snapshot, not the current editable ruling or decision. */
export function sentOutcome(record: SentRecord): FinalOutcome {
  return { decision: record.decision, label: PARTY_DECISION_LABELS[record.decision], amount: ["no_action", "needs_review"].includes(record.decision) ? null : record.amount,
    source: record.reviewer && record.reviewer.kind !== "accepted" ? "override" : "ruling", needsAmount: false };
}
export function sentOutcomeText(record: SentRecord): string {
  return `${DECISION_LABELS[record.decision]}${record.amount != null && !["no_action", "needs_review"].includes(record.decision) ? ` $${record.amount.toFixed(2)}` : ""}`;
}
export function reviewAction(record: SentRecord): string {
  return record.reviewer?.kind === "overridden" ? "overridden" : record.reviewer?.kind === "decided" ? "decided by reviewer" : record.reviewer ? "accepted" : "policy ruling";
}

/** "08:42" from a Date, in the reviewer's own time. */
export function clockText(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function hasNote(record: Pick<SentRecord, "notes">): boolean {
  return PARTIES.some(party => !!record.notes?.[party]?.trim());
}

/** "✓ Sent to rider and driver · 08:42 · with a reviewer note" (or "· as generated"). */
export function sentText(record: Pick<SentRecord, "at" | "notes" | "correction">): string {
  return `✓ ${record.correction ? "Correction sent" : "Sent"} to rider and driver · ${record.at} · ${hasNote(record) ? "with a reviewer note" : "as generated"}`;
}

// ---- Phones: preview, then delivered ----------------------------------------------------

export interface PhoneState { delivered: boolean; tag: string; canAppeal: boolean; caption: string | null }

/**
 * Before "Approve & send" the phones are a preview and the appeal button is disabled; after it,
 * they are delivered and the parties can appeal.
 */
export function phoneState(party: Party, sent: Pick<SentRecord, "at"> | null): PhoneState {
  if (sent) return { delivered: true, tag: `Delivered ${sent.at}`, canAppeal: true, caption: null };
  return { delivered: false, tag: "Preview", canAppeal: false, caption: `Available to the ${party} after sending` };
}

export const DELIVERED_ANNOUNCEMENT = "Messages delivered; parties can now appeal";

/** "Messages sent for D001", or "Review complete for D001" once all five steps are reviewed. */
export function closingTitle(disputeId: string, summary: { complete: boolean } | null): string {
  return summary?.complete ? `Review complete for ${disputeId}` : `Messages sent for ${disputeId}`;
}

export const SEND_TOOLTIP = "Simulated: this prototype sends no real message to the rider or driver.";
