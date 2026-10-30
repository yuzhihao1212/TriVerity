// Notify parties: the gate, the locked outcome and amount, the suggested wording, the privacy
// check and the "sent" record. Pure apart from the storage handed to the sent store.

import type { FinalDecision, SavedDecision } from "./decisionState";
import { confirmedCopy } from "./customerCopy";
import { RULES } from "./glossary";
import { DECISION_LABELS } from "./outcomeTone";
import { PARTY_DECISION_LABELS } from "./partyView";
import type { Decision, DisputeCase, PartyMessage, Resolution } from "./types";

export type Party = "rider" | "driver";
export const PARTIES: Party[] = ["rider", "driver"];
/** RD-5: the credit for the lost time. */
export const COMPENSATION_CREDIT = 5;

/**
 * The editors open only after the reviewer accepted or overrode the ruling. In the public
 * demo (decisions unavailable, 403), opening the Ruling step is enough, matching the
 * Ruling-tick fallback.
 *
 * A case on hold opens for nobody: the second reviewer decides first. A reopened case opens
 * on a decision saved in this review, never on the one it carried before the reopen.
 */
export function notifyGate({ saved, unavailable, rulingVisited, held = false }: {
  saved: boolean; unavailable: boolean; rulingVisited: boolean; held?: boolean;
}): "open" | "locked" {
  if (held) return "locked";
  return saved || (unavailable && rulingVisited) ? "open" : "locked";
}

/**
 * The most a refund can be (REF-1): the fare actually charged (the no-show fee for a no-show).
 * A fare of 0 is a known 0, so it caps the refund at 0 — nothing was charged, so nothing can
 * be refunded. Null means no usable fare is known (missing, not a number, or negative), and
 * then no cap is applied.
 */
export function maxRefund(dispute: Pick<DisputeCase, "fare">): number | null {
  const charged = dispute.fare?.actual ?? dispute.fare?.cancellation_fee;
  return typeof charged === "number" && Number.isFinite(charged) && charged >= 0 ? charged : null;
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
export function finalOutcome(resolution: Pick<Resolution, "decision" | "refund_amount">, saved: Pick<SavedDecision, "kind" | "decision" | "amount"> | null,
  dispute: Pick<DisputeCase, "fare">, partialAmount: number | null = null): FinalOutcome {
  if (!saved || saved.kind === "accepted" || saved.kind === "auto") {
    const refunds = ["partial_refund", "full_refund", "compensation"].includes(resolution.decision);
    return { decision: resolution.decision, label: PARTY_DECISION_LABELS[resolution.decision],
      amount: refunds ? resolution.refund_amount : null, needsAmount: false, source: "ruling" };
  }
  const decision: FinalDecision = saved.decision;
  const base = { decision, label: PARTY_DECISION_LABELS[decision], source: "override" as const };
  if (decision === "no_action") return { ...base, amount: null, needsAmount: false };
  if (decision === "full_refund") return { ...base, amount: maxRefund(dispute), needsAmount: false };
  if (decision === "compensation") return { ...base, amount: COMPENSATION_CREDIT, needsAmount: false };
  // The amount chosen when overriding (Ruling step); older decisions without one ask for it here.
  if (saved.amount != null) return { ...base, amount: saved.amount, needsAmount: false };
  return { ...base, amount: partialAmount, needsAmount: true };
}

const money = (value: number) => `$${value.toFixed(2)}`;
const isRefund = (decision?: Decision) => decision === "partial_refund" || decision === "full_refund";
/** A known $0 refund: nothing was charged, so no money moves and none is promised. */
export const isZeroRefund = (outcome: Partial<Pick<FinalOutcome, "decision" | "amount">>) => isRefund(outcome.decision) && outcome.amount === 0;
/** A refund with no amount (no fare on record): the parties can't be told it is settled. */
export const isUnknownRefund = (outcome: Pick<FinalOutcome, "decision" | "amount" | "needsAmount">) =>
  isRefund(outcome.decision) && outcome.amount == null && !outcome.needsAmount;

/**
 * The generated message, read-only: exactly what the party sees. Accepted: the ruling's own
 * explanation for that party. Overridden or decided by the reviewer: plain wording for the
 * final outcome, so it never contradicts it. The reviewer can only add a note under it.
 */
// No deadline until the team confirms the appeal window (customerCopy CONFIRMED).
export const AUTO_NOTICE = confirmedCopy().autoNotice;

/**
 * The message in parts for the More info screen, when the party gets the ruling's own
 * message. A reviewer's override has its own plain wording, so it has no parts and the
 * phone shows the whole message, as do results from before the parts existed.
 */
export function messageParts(party: Party, resolution: Pick<Resolution, "rider_message" | "driver_message">,
  outcome: Pick<FinalOutcome, "source"> & Partial<Pick<FinalOutcome, "decision" | "amount">>): PartyMessage | null {
  if (outcome.source !== "ruling" || (outcome.decision && isZeroRefund(outcome))) return null;
  return (party === "rider" ? resolution.rider_message : resolution.driver_message) ?? null;
}

export function generatedMessage(party: Party, resolution: Pick<Resolution, "rider_explanation" | "driver_explanation">,
  outcome: Pick<FinalOutcome, "decision" | "amount" | "source">): string {
  // Ahead of the ruling's own wording, which would say "you're getting $0.00 back".
  if (isZeroRefund(outcome)) {
    return party === "rider" ? "We looked at your dispute. Nothing was charged, so there is nothing to refund."
      : "We looked at this trip's dispute. The rider wasn't charged, so nothing changes for you.";
  }
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
export function noteWarnings(notes: Record<Party, string>, publicCaseId?: string | null): Record<Party, string[]> {
  return { rider: privacyWarnings(notes.rider, publicCaseId), driver: privacyWarnings(notes.driver, publicCaseId) };
}

/** Why "Approve & send" is blocked, or null when it can go. */
export function sendBlock({ amountMissing, needsSecondApproval = false, held = false, warnings, sendAnyway = false }: {
  amountMissing: boolean; needsSecondApproval?: boolean; held?: boolean; warnings: Record<Party, string[]>; sendAnyway?: boolean;
}): "amount" | "second" | "held" | "privacy" | null {
  // On hold: nobody is notified until the second reviewer decides, whatever the notes say.
  if (held) return "held";
  if (amountMissing) return "amount";
  // Over the reviewer's own limit: it needs a second reviewer, not an override.
  if (needsSecondApproval) return "second";
  if (!PARTIES.some(party => warnings[party].length)) return null;
  // Internal data is never waved through: "Send anyway" is only ever offered for a soft term.
  return sendAnyway && !hasInternalData(warnings) ? null : "privacy";
}

// ---- Privacy check -------------------------------------------------------------

/** Evidence IDs the parties never see, e.g. "GPS-4". */
const EVIDENCE_PREFIXES = ["TRIP", "GPS", "FARE", "CHAT", "HIST"];
/** Used when the policy's own rule IDs are not available on the frontend. */
const FALLBACK_RULE_PREFIXES = ["RD", "NS", "REF", "PREC", "SAFE", "FRAUD", "ESC"];
/** "RD-3", "rd - 3", "RD_3" and "RD3", in any case. */
const anyPrefix = (prefixes: string[], digits = "\\d+") => new RegExp(`\\b(?:${prefixes.join("|")})(?:\\s*[-_]\\s*)?${digits}\\b`, "i");
/**
 * "RD 3", "RD.3" or "RD/3", capitals only: in lower case "trip 1" and "fare 2" are ordinary words.
 * GPS is left out, because "GPS 4 minutes" is how anyone would write it.
 */
const spacedPrefix = (prefixes: string[], digits = "\\d+") => new RegExp(`\\b(?:${prefixes.filter(prefix => prefix !== "GPS").join("|")})[\\s./]+${digits}\\b`);

/**
 * The rule-ID prefixes from the policy itself: glossary.ts mirrors data/policies/
 * ryde_mock_policy.json, so a prefix the policy adds is caught without a code change.
 */
export function rulePrefixes(rules: Record<string, unknown> = RULES): string[] {
  const from = Object.keys(rules).map(id => id.split("-", 1)[0]).filter(Boolean);
  return from.length ? [...new Set(from)] : FALLBACK_RULE_PREFIXES;
}

interface InternalTerm { re: RegExp; /** The same term in another form. */ also?: RegExp; label: string; /** A soft term a reviewer may wave through. */ soft?: true }

/**
 * Internal wording the parties must never see. "Send anyway" cannot clear internal data (see
 * sendBlock), because a rule, evidence or case ID tells a party how the decision was reached and
 * what we hold about them. The soft terms are everyday words too ("your journey history"), so
 * a reviewer who has read the warning may send them.
 */
const INTERNAL_TERMS: InternalTerm[] = [
  { re: /\bfraud\b(?!-\d)/i, label: "fraud" }, // "FRAUD-1" is reported as a rule ID
  { re: /\bbad[- ]faith\b/i, label: "bad faith" },
  { re: /\brisk score\b/i, label: "risk score" },
  { re: /\brisk(?! score)\b/i, label: "risk", soft: true },
  { re: /\bsignals?\b/i, label: "signals", soft: true },
  { re: /\bprevious disputes?\b/i, label: "previous disputes" },
  { re: /\bhistory\b/i, label: "history", soft: true },
  { re: /\bprecedents?\b/i, label: "precedent" },
  { re: anyPrefix(EVIDENCE_PREFIXES), also: spacedPrefix(EVIDENCE_PREFIXES), label: "evidence IDs" },
  { re: anyPrefix(rulePrefixes()), also: spacedPrefix(rulePrefixes()), label: "internal rule IDs" },
  // Precedents and internal case IDs, e.g. "R-001", "P-063".
  // Always three digits or more, so "R-1 rated" or "P-1 visa" stay ordinary words.
  { re: anyPrefix(["P", "R"], "\\d{3,}"), also: spacedPrefix(["P", "R"], "\\d{3,}"), label: "internal case IDs" },
];

/** Internal data: an ID or signal from the review, which "Send anyway" can never clear. */
export function isInternalData(label: string): boolean {
  return INTERNAL_TERMS.some(term => term.label === label && !term.soft);
}
export function hasInternalData(warnings: Record<Party, string[]>): boolean {
  return PARTIES.some(party => warnings[party].some(isInternalData));
}

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Full-width letters and digits become plain, every dash a hyphen, and invisible characters go. */
const normalized = (text: string) => text.normalize("NFKC").replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "").replace(/[\p{Pd}\u2212]/gu, "-");

/**
 * Internal wording the parties must never see, in the order found. Empty means clean.
 * The dispute's own case ID is shown to the party on their phone ("Case D001"), so it is
 * public and is left out of the text before checking rather than treated as internal data.
 * Only the whole ID is left out: for a case called "GPS", "GPS-4" is still an evidence ID.
 */
export function privacyWarnings(text: string, publicCaseId?: string | null): string[] {
  const own = publicCaseId?.trim();
  const clean = normalized(text);
  const checked = own ? clean.replace(new RegExp(`(?<![A-Za-z0-9_-])${escapeRe(normalized(own))}(?![A-Za-z0-9_-])`, "gi"), " ") : clean;
  return INTERNAL_TERMS.filter(term => term.re.test(checked) || term.also?.test(checked)).map(term => term.label);
}

// ---- Sent record ------------------------------------------------------------------

/** What was sent: the generated message and the reviewer's note (empty: none) per party. */
export interface SentRecord { at: string; messages: Record<Party, string>; parts?: Partial<Record<Party, PartyMessage>>; notes: Record<Party, string>; decision: Decision; amount: number | null; disputeId?: string; reviewer?: SavedDecision; correction?: boolean; timestamp?: string }
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
  /** Every review key known: this session's writes, the case history, and the legacy record. */
  const allKeys = (): string[] =>
    [...new Set([...Object.keys(readObject(SENT_KEY)), ...Object.keys(readObject(CASE_HISTORY_KEY)), ...memory.keys()])];
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
    /**
     * A reviewer reopened this dispute, in any of its reviews: the case stays with the
     * reviewer, so a later run must not close it automatically again. Keyed by dispute,
     * because a re-run gives the case a new review key.
     */
    reviewerReopened(disputeId: string): boolean {
      return allKeys().filter(key => key.startsWith(`${disputeId}|`))
        .some(key => events(key).some(event => event.type === "reopened"));
    },
    set(key: string, record: SentRecord): void {
      if (get(key)) return; // A closed review cannot send again until deliberately reopened.
      const id = record.disputeId ?? (key.includes("|") ? key.slice(0, key.indexOf("|")) : null);
      const correction = events(key).some(e => e.type === "sent")
        || (id != null && allKeys().some(k => k !== key && k.startsWith(`${id}|`) && events(k).some(e => e.type === "sent")));
      append(key, { ...record, ...(correction ? { correction: true } : {}), type: "sent" });
    },
    reopen(key: string, at: string, timestamp?: string): boolean {
      if (!get(key)) return false;
      append(key, { type: "reopened", at, timestamp });
      return true;
    },
    earlier(disputeId: string, currentKey: string): { key: string; events: ReviewEvent[] }[] {
      return allKeys().filter(key => key !== currentKey && key.startsWith(`${disputeId}|`))
        .map(key => ({ key, events: events(key) })).filter(item => item.events.some(e => e.type === "sent"));
    },
  };
}

/**
 * The record that closes a routine case without a reviewer: the ruling's own messages, each
 * followed by the automatic-decision notice, sent under the ruling's decision and amount.
 * Null unless the policy marked the ruling eligible and it wasn't picked for the audit sample.
 * Only these records carry the notice; a case a person sends never does.
 */
export function autoSentRecord(disputeId: string, resolution: Pick<Resolution, "decision" | "refund_amount" | "autonomy" | "rider_explanation" | "driver_explanation" | "rider_message" | "driver_message">,
  dispute: Pick<DisputeCase, "fare">, now = new Date()): SentRecord | null {
  const autonomy = resolution.autonomy;
  if (!autonomy?.eligible || autonomy.audit || resolution.decision === "needs_review") return null;
  const outcome = finalOutcome(resolution, null, dispute);
  if (isUnknownRefund(outcome)) return null; // Nothing to tell them yet: it stays with a reviewer.
  const message = (party: Party) => `${generatedMessage(party, resolution, outcome)} ${AUTO_NOTICE}`;
  const parts = sentParts(party => {
    const own = messageParts(party, resolution, outcome);
    return own ? { ...own, next: `${own.next} ${AUTO_NOTICE}` } : null;
  });
  return {
    ...(parts ? { parts } : {}),
    at: clockText(now), timestamp: now.toISOString(), disputeId,
    reviewer: { kind: "auto", decision: resolution.decision, precedentId: "" },
    messages: { rider: message("rider"), driver: message("driver") }, notes: { rider: "", driver: "" },
    decision: outcome.decision, amount: outcome.amount,
  };
}

/**
 * A review that must not close itself: it already has history, a reviewer reopened the dispute,
 * or a reviewer put it on hold. The last two hold across runs, which each get a new review key.
 */
export function staysWithReviewer(store: Pick<ReturnType<typeof createSentStore>, "events" | "reviewerReopened">, disputeId: string, key: string, wasHeld: boolean): boolean {
  return wasHeld || store.events(key).length > 0 || store.reviewerReopened(disputeId);
}

/** Both parties' parts for a sent record, or undefined when neither has any. */
export function sentParts(of: (party: Party) => PartyMessage | null): Partial<Record<Party, PartyMessage>> | undefined {
  const parts: Partial<Record<Party, PartyMessage>> = {};
  for (const party of PARTIES) { const own = of(party); if (own) parts[party] = own; }
  return Object.keys(parts).length ? parts : undefined;
}

/** The delivered snapshot, not the current editable ruling or decision. */
export function sentOutcome(record: SentRecord): FinalOutcome {
  const overridden = record.reviewer && !["accepted", "auto"].includes(record.reviewer.kind);
  return { decision: record.decision, label: PARTY_DECISION_LABELS[record.decision], amount: ["no_action", "needs_review"].includes(record.decision) ? null : record.amount,
    source: overridden ? "override" : "ruling", needsAmount: false };
}
export function sentOutcomeText(record: SentRecord): string {
  return `${DECISION_LABELS[record.decision]}${record.amount != null && !["no_action", "needs_review"].includes(record.decision) ? ` $${record.amount.toFixed(2)}` : ""}`;
}
export function reviewAction(record: SentRecord): string {
  return record.reviewer?.kind === "overridden" ? "overridden" : record.reviewer?.kind === "decided" ? "decided by reviewer" : record.reviewer?.kind === "auto" ? "auto-resolved by policy" : record.reviewer ? "accepted" : "policy ruling";
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
/** The reviewer's line for an appeal filed from a party's phone, e.g. "Rider appealed · safety, review first". */
export function appealSummary(appeal: { party: Party; priority: "safety" | "standard" }): string {
  return `${appeal.party === "rider" ? "Rider" : "Driver"} appealed${appeal.priority === "safety" ? " · safety, review first" : ""}`;
}

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
