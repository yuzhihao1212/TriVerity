// The Evidence Chat card as a thread (round 8 item 3). Display only: every sentence, chip and
// row is built from the case's own messages and chat facts; nothing is paraphrased or invented.
import { chatTime } from "./evidenceDisplay";
import type { ChatMessage } from "./types";

type Party = "rider" | "driver";
interface Fact { text: string; id?: string }

const QUOTED = /^(Disagreement in chat|Agreement in chat|Threatening message): (rider|driver): "(.*)"$/;
const TONE = /^(Rider|Driver) tone: ([\w-]+)(?: \((.+)\))?$/;

function quoted(text: string) {
  const match = QUOTED.exec(text);
  return match ? { kind: match[1], party: match[2] as Party, message: match[3] } : null;
}

/** The index of the message a chat fact quotes (same sender and wording), or -1. */
export function quotedMessageIndex(messages: readonly ChatMessage[], text: string): number {
  const q = quoted(text);
  return q ? messages.findIndex(m => m.sender === q.party && m.message.trim() === q.message.trim()) : -1;
}

/** First sentence of a message, for a short quote; the full message stays in the thread. */
function firstSentence(message: string): string {
  const match = /^(.+?[.!?])(\s|$)/.exec(message.trim());
  return match ? match[1] : message.trim();
}

const at = (message: ChatMessage | undefined) => {
  const time = chatTime(message?.timestamp);
  return time ? ` at ${time}` : "";
};

/**
 * One sentence about the exchange, from the case's messages and the chat checks, e.g.
 * "The rider objected at 08:12; the driver replied: “Traffic on the usual road, this is faster.”"
 * Null when there is nothing to say beyond the messages themselves (the caller keeps its line).
 */
export function chatSummary(messages: readonly ChatMessage[], facts: readonly Fact[]): string | null {
  const clauses: string[] = [];
  const other = (party: Party): Party => party === "rider" ? "driver" : "rider";
  const disagreement = facts.find(fact => quoted(fact.text)?.kind === "Disagreement in chat");
  if (disagreement) {
    const q = quoted(disagreement.text)!, index = quotedMessageIndex(messages, disagreement.text);
    clauses.push(`the ${q.party} objected${at(messages[index])}`);
    const reply = index >= 0 ? messages.slice(index + 1).find(m => m.sender === other(q.party)) : undefined;
    clauses.push(reply ? `the ${other(q.party)} replied: “${firstSentence(reply.message)}”` : `the ${other(q.party)} did not reply in the chat`);
  }
  const agreement = facts.find(fact => quoted(fact.text)?.kind === "Agreement in chat");
  if (agreement) {
    const q = quoted(agreement.text)!, index = quotedMessageIndex(messages, agreement.text);
    const before = index >= 0 ? messages.slice(0, index).filter(m => m.sender === other(q.party)).length : 0;
    if (before) clauses.push(`the ${other(q.party)} messaged ${before === 1 ? "once" : before === 2 ? "twice" : `${before} times`}`);
    clauses.push(`the ${q.party} agreed${at(messages[index])}: “${firstSentence(q.message)}”`);
  }
  const threat = facts.find(fact => quoted(fact.text)?.kind === "Threatening message");
  if (threat) {
    const q = quoted(threat.text)!;
    clauses.push(`a ${q.party} message${at(messages[quotedMessageIndex(messages, threat.text)])} was flagged as threatening`);
  }
  if (!clauses.length) return null;
  const sentence = clauses.join("; ");
  return `${sentence[0].toUpperCase()}${sentence.slice(1)}${/[.!?”]$/.test(sentence) ? "" : "."}`;
}

export interface ToneChip { party: Party; value: string; label: string }

/** The tone chips beside the folded facts, from the case's own tone facts (none without them). */
export function toneChips(facts: readonly Fact[]): ToneChip[] {
  return (["rider", "driver"] as const).flatMap(party => {
    const fact = facts.find(f => TONE.exec(f.text)?.[1].toLowerCase() === party);
    const value = fact ? TONE.exec(fact.text)![2] : null;
    return value ? [{ party, value, label: `${party} ${value}` }] : [];
  });
}

export interface ChatFactRow<T extends Fact> {
  fact: T; label: string;
  /** Plain text for the row; null when the row points to a message instead. */
  text: string | null;
  /** Index of the message this row points to (disagreement, agreement, threat). */
  messageIndex?: number; messageLabel?: string;
  tone?: { value: string; detail: string | null };
}

const KIND_LABELS: Record<string, string> = {
  "Disagreement in chat": "Disagreement", "Agreement in chat": "Agreement", "Threatening message": "Threatening message",
};

/**
 * The folded list: contact, then the checks that quote a message (pointing to it rather than
 * repeating it), then each party's tone, then anything else in the engine's order.
 */
export function chatFactRows<T extends Fact>(facts: readonly T[], messages: readonly ChatMessage[]): ChatFactRow<T>[] {
  const rank = (fact: T) => /contact/i.test(fact.text) ? 0 : quoted(fact.text) ? 1 : TONE.test(fact.text) ? (fact.text.startsWith("Rider") ? 2 : 3) : 4;
  return facts.map((fact, index) => ({ fact, index })).sort((a, b) => rank(a.fact) - rank(b.fact) || a.index - b.index).map(({ fact }) => {
    const q = quoted(fact.text);
    if (q) {
      const messageIndex = quotedMessageIndex(messages, fact.text);
      const message = messages[messageIndex];
      return messageIndex >= 0
        ? { fact, label: KIND_LABELS[q.kind], text: null, messageIndex, messageLabel: `The ${q.party}'s message${at(message)}` }
        : { fact, label: KIND_LABELS[q.kind], text: `The ${q.party}: “${q.message}”` };
    }
    const tone = TONE.exec(fact.text);
    if (tone) return { fact, label: `${tone[1]} tone`, text: null, tone: { value: tone[2], detail: tone[3] ?? null } };
    if (/contact/i.test(fact.text)) return { fact, label: "Contact", text: fact.text };
    return { fact, label: "Chat record", text: fact.text };
  });
}

export const CHAT_CHECKS_NOTE = "Tone and disagreement are automated checks on the messages.";

export function showFactsLabel(count: number, open: boolean): string {
  return open ? `Hide ${count === 1 ? "the fact" : `${count} facts`}` : `Show ${count} ${count === 1 ? "fact" : "facts"}`;
}

export type FoldAction = { type: "toggle" } | { type: "reveal"; id: string | null };

/** The fold opens on a click, or when a citation asks for one of its own facts (CHAT-2 in an argument). */
export function foldOpenAfter(open: boolean, action: FoldAction, factIds: readonly (string | undefined)[]): boolean {
  if (action.type === "toggle") return !open;
  return open || (!!action.id && factIds.includes(action.id));
}
