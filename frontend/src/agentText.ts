// Agent log messages are written by the backend for logs, with raw values: tags like
// "[fallback]", snake_case decisions and tools, 0.xx similarities. This turns them into
// reviewer-facing text from the structured result, without changing what they say.
// The output still goes through EvidenceText, so evidence IDs stay linked.

import { decisionLabel } from "./outcomeTone";
import { toolName } from "./stepVisuals";
import type { Resolution } from "./types";

type Context = Pick<Resolution, "decision" | "confidence" | "precedents" | "evidence_collection"> | null | undefined;

const TAG = /^\s*\[(?:llm|fallback)\]\s*/i;
const SNAKE = /\b[a-z]+(?:_[a-z]+)+\b/g;

export function stripTag(message: string): string {
  return message.replace(TAG, "");
}

const pct = (similarity: number) => `${Math.round(similarity * 100)}%`;
const matchText = (id: string, similarity: number, decision: string) => `${id} (${pct(similarity)} match, ${decisionLabel(decision).toLowerCase()})`;

/** Any leftover snake_case token becomes its label (decisions, tools) or plain words. */
function plainWords(text: string): string {
  return text.replace(SNAKE, token => {
    const decision = decisionLabel(token);
    if (decision !== token.replace(/_/g, " ")) return decision.toLowerCase();
    return toolName(token).toLowerCase();
  });
}

function precedentText(message: string, resolution: Context): string {
  const [first, retrieved = ""] = stripTag(message).split(/\s*Retrieved:\s*/);
  const head = first.trim();
  const matches = resolution?.precedents?.matches
    ?? [...retrieved.matchAll(/([A-Z]+-\d+) \((\d*\.\d+), ([a-z_]+)\)/g)].map(m => ({ id: m[1], similarity: Number(m[2]), decision: m[3] }));
  const list = matches.length
    ? `${matches.length} similar past ${matches.length === 1 ? "ruling" : "rulings"}: ${matches.map(m => matchText(m.id, m.similarity, m.decision)).join(", ")}.`
    : "No similar past rulings.";
  return [head, list].filter(Boolean).join(" ");
}

function collectorText(message: string, resolution: Context): string {
  // The card shows the calls as chips when it has them: no raw remainder then.
  if (resolution?.evidence_collection?.calls?.length) return "";
  const counts = [...stripTag(message).matchAll(/(rider|driver)'s request: (\d+) tool calls?/g)].map(m => ({ party: m[1], n: Number(m[2]) }));
  if (!counts.length) return plainWords(stripTag(message));
  const lookups = (n: number) => `${n} ${n === 1 ? "lookup" : "lookups"}`;
  if (counts.length === 2 && counts[0].n === counts[1].n) return `${lookups(counts[0].n)} for each side`;
  return counts.map(c => `${c.party === "rider" ? "Rider" : "Driver"}: ${lookups(c.n)}`).join(" · ");
}

function judgeText(message: string, resolution: Context): string {
  if (resolution) return `${decisionLabel(resolution.decision)} · ${Math.round(resolution.confidence * 100)}% confident`;
  // Live progress has no result yet: read the same facts from the message.
  const match = /^([a-z_]+) \((\d+)% confidence\)/.exec(stripTag(message));
  return match ? `${decisionLabel(match[1])} · ${match[2]}% confident` : plainWords(stripTag(message));
}

/** Reviewer-facing text for one agent log entry. Empty when the card shows the content another way. */
export function humanizeAgentMessage(agent: string, message: string, resolution?: Context): string {
  switch (agent) {
    case "judge": return judgeText(message, resolution);
    case "precedent_agent": return precedentText(message, resolution);
    case "evidence_collector": return collectorText(message, resolution);
    default: {
      // "similarity 0.88" reads as "similarity 88%". Only right after the word: a blanket
      // "0.xx" rewrite would turn "$0.50" or "0.75 km" into percentages.
      return plainWords(stripTag(message)).replace(/\b(similarit(?:y|ies)\s+(?:of\s+)?)0\.(\d{2})(?!\d)/gi,
        (_, lead: string, digits: string) => `${lead}${Number(digits)}%`);
    }
  }
}
