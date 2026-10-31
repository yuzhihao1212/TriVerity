// The Evidence step as findings: one plain line per source, flagged ones first, so a reviewer can
// read the case at a glance and open the facts behind any line. Pure, like the other story helpers.

import { chatTakeaway, tripTakeaway } from "./evidenceDisplay";
import { fareHeadline } from "./fareStory";
import { gpsHeadline } from "./gpsStory";
import { SOURCE_LABELS } from "./presentation";
import type { ChatMessage, DisputeCase } from "./types";

export interface Finding { source: string; label: string; line: string; flagged: boolean }

const party = (word: string) => `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`;
const noStop = (line: string) => line.replace(/\.$/, "");

/** The chat fact for a threat, disagreement or agreement names the sender: "Threatening message: driver: ...". */
function chatFinding(facts: readonly string[], messages: readonly ChatMessage[]): { line: string; flagged: boolean } {
  const sender = (kind: string) => facts.map(text => new RegExp(`^${kind}:\\s*(rider|driver)\\b`, "i").exec(text)?.[1]).find(Boolean);
  const threat = sender("Threatening message");
  if (threat) return { line: `${party(threat)} message flagged as threatening`, flagged: true };
  if (facts.some(text => /^Threatening message:/i.test(text))) return { line: "A message flagged as threatening", flagged: true };
  const objected = sender("Disagreement in chat");
  if (objected) return { line: `${party(objected)} objected in chat`, flagged: false };
  const agreed = sender("Agreement in chat");
  if (agreed) return { line: `${party(agreed)} agreed in chat`, flagged: false };
  return { line: noStop(chatTakeaway([...messages])), flagged: false };
}

export function findingLine(source: string, facts: readonly string[], dispute?: Pick<DisputeCase, "trip" | "fare" | "chat_logs">): { line: string; flagged: boolean } {
  const plain = (line: string) => ({ line: noStop(line), flagged: false });
  // The card's sentence can point at the rows below it, which a one-line finding can't.
  if (source === "trip") { const line = tripTakeaway(dispute?.trip); return plain(/below\.?$/.test(line) ? "Recorded trip details" : line); }
  if (source === "gps") return plain(gpsHeadline([...facts]) ?? "GPS records for this trip");
  if (source === "fare") {
    const headline = dispute ? fareHeadline(dispute, [...facts]) : null;
    if (headline) return plain(headline.lead);
    const fee = dispute?.fare?.cancellation_fee;
    return plain(typeof fee === "number" ? `No-show fee of $${fee.toFixed(2)}` : "Recorded fare items and checks");
  }
  if (source === "chat") return chatFinding(facts, dispute?.chat_logs ?? []);
  if (source === "history") return plain("Background only");
  return plain("Recorded case details");
}

/** In the page's usual source order, except that anything flagged comes first and opens first. */
export function caseFindings(cards: readonly { source: string; facts: readonly string[] }[], dispute?: Pick<DisputeCase, "trip" | "fare" | "chat_logs">): Finding[] {
  const findings = cards.map(card => ({ source: card.source, label: SOURCE_LABELS[card.source] ?? card.source, ...findingLine(card.source, card.facts, dispute) }));
  return [...findings.filter(finding => finding.flagged), ...findings.filter(finding => !finding.flagged)];
}

/** Moves within the list with the arrow keys, wrapping at both ends. */
export function nextFinding(index: number, total: number, key: string): number | null {
  if (key === "ArrowDown") return (index + 1) % total;
  if (key === "ArrowUp") return (index - 1 + total) % total;
  if (key === "Home") return 0;
  if (key === "End") return total - 1;
  return null;
}
