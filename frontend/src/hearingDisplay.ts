import { parseChat, parseRouteCoverage, parseStop } from "./factVisuals";
import { parseOffRoute } from "./gpsStory";
import { distanceText, trimDecimal } from "./numberFormat";
import { computedFacts, evidenceItems, factIndex } from "./presentation";
import type { AgentCase, Resolution, RuleCheck } from "./types";

/** Abbreviations whose full stop doesn't end the sentence. */
const ABBREVIATION = /\b(?:e\.g|i\.e|vs|approx)$/i;

/** Keep the whole first sentence, including closing quotes and any inline citations. */
export function bottomLine(text: string): { first: string; rest: string } {
  const trimmed = text.trim();
  const ends = trimmed.matchAll(/[.!?](?:["'”’)]*)(?:\s*\((?:TRIP|GPS|FARE|CHAT|HIST)-[^)]*\))?(?=\s|$)/g);
  const end = [...ends].find(match => !(match[0].startsWith(".") && ABBREVIATION.test(trimmed.slice(0, match.index))));
  const split = end ? end.index + end[0].length : trimmed.length;
  return { first: trimmed.slice(0, split), rest: trimmed.slice(split).trim() };
}

/**
 * Fact text by ID: the Evidence step's facts first (they cover IDs whose text the advocates
 * didn't pair), then the advocates' own pairs. Unknown IDs are absent.
 */
export function factTexts(resolution: Resolution): Map<string, string> {
  const facts = new Map<string, string>();
  for (const fact of [...factIndex(resolution), ...(resolution.judge_evidence ? computedFacts(resolution) : [])]) {
    if (fact.id && !facts.has(fact.id)) facts.set(fact.id, fact.text);
  }
  return facts;
}

/** Facts shown before the remaining citations can be expanded. */
export const GROUP_LIMIT = 4;

/** Compare citations across both rounds; never infer IDs from evidence positions. */
export function comparisonGroups(resolution: Resolution, limit = GROUP_LIMIT) {
  const cited = (item: AgentCase) => new Set([...item.evidence_ids, ...(item.rebuttal?.evidence_ids ?? [])]);
  const rider = cited(resolution.rider_case), driver = cited(resolution.driver_case);
  const facts = factTexts(resolution);
  return [
    { title: "Both sides cite", ids: [...rider].filter(id => driver.has(id)) },
    { title: "Only the rider", ids: [...rider].filter(id => !driver.has(id)) },
    { title: "Only the driver", ids: [...driver].filter(id => !rider.has(id)) },
  ].map(group => {
    const all = group.ids.map(id => ({ id, text: facts.get(id) ?? null }));
    // Facts with known text first, so the visible ones say something.
    all.sort((a, b) => Number(b.text !== null) - Number(a.text !== null));
    return { title: group.title, facts: all.slice(0, limit), more: Math.max(0, all.length - limit) };
  }).filter(group => group.facts.length > 0);
}


export const HEARING_CITATIONS_SEEN_KEY = "triverity.hearingCitationsSeen";

/** Fixed rider/both/driver columns. Counts include every unique ID across both rounds. */
export function hearingComparison(resolution: Resolution) {
  const groups = comparisonGroups(resolution, Infinity);
  const columns = ([
    { key: "rider", title: "Only the rider", source: "Only the rider" },
    { key: "both", title: "Both cited", source: "Both sides cite" },
    { key: "driver", title: "Only the driver", source: "Only the driver" },
  ] as const).map(column => {
    const group = groups.find(group => group.title === column.source);
    return { key: column.key, title: column.title, facts: group?.facts ?? [], count: group?.facts.length ?? 0 };
  });
  const counts = { rider: columns[0].count, both: columns[1].count, driver: columns[2].count };
  const hasCitations = Object.values(counts).some(count => count > 0);
  return { columns, counts, hasCitations,
    overlapEmpty: hasCitations ? "No fact cited by both sides: they argue from different evidence." : "No citation IDs supplied in this result." };
}

/** Short neutral phrases from the existing fact. Its ID still opens the exact original wording. */
export function hearingFact(text: string | null, id: string): { text: string; icon: string } {
  if (text == null) return { text: "Fact text unavailable. See Evidence.", icon: "info" };
  const off = parseOffRoute(text);
  if (off) return { text: `Off route for ${off.minutes} min, up to ${distanceText(off.awayMetres)} away`, icon: "route" };
  const stop = parseStop(text);
  if (stop) return { text: `Stopped ${trimDecimal(stop.minutes)} min at ${stop.time}${stop.where ? `, ${stop.where}` : ""}`, icon: "pause" };
  const arrival = /^Driver arrived ([\d.]+) m from pickup point$/.exec(text);
  if (arrival) return { text: `Arrived ${trimDecimal(arrival[1])} m from pickup`, icon: "pin" };
  const wait = /^(?:Driver waited ([\d.]+) min at pickup|Trip record: driver wait logged as ([\d.]+) min)$/.exec(text);
  if (wait) return { text: wait[1] ? `Waited ${trimDecimal(wait[1])} min at pickup` : `Recorded wait: ${trimDecimal(wait[2])} min`, icon: "generic" };
  const fee = /^Trip record: no-show fee charged (\$[\d.]+)$/.exec(text);
  if (fee) return { text: `No-show fee: ${fee[1]}`, icon: "receipt" };
  const record = /^Trip record: (distance|duration) expected ([\d.]+) (km|min), actual ([\d.]+) (?:km|min)$/.exec(text);
  if (record) return { text: `${record[1] === "distance" ? "Distance" : "Duration"}: ${trimDecimal(record[2])} → ${trimDecimal(record[4])} ${record[3]}`, icon: record[1] === "distance" ? "route" : "generic" };
  const coverage = parseRouteCoverage(text);
  if (coverage && coverage.total > 0 && coverage.onRoute <= coverage.total) return { text: `${coverage.total - coverage.onRoute} of ${coverage.total} GPS readings off plan`, icon: "pin" };
  const fare = /^Fare: charged (\$[\d,.]+), expected (\$[\d,.]+)$/.exec(text);
  if (fare) return { text: `Charged ${fare[1]}; expected ${fare[2]}`, icon: "receipt" };
  if (text.startsWith("Fare line: ")) return { text: text.slice("Fare line: ".length), icon: "receipt" };
  const tone = /^(Rider|Driver) tone: ([\w-]+)(?: \(|$)/.exec(text);
  if (tone) return { text: `${tone[1]}'s tone was ${tone[2]}`, icon: "chat" };
  const change = /^(Route was|Trip took) ([+-]\d+)% vs expected (distance|duration)$/.exec(text);
  if (change) {
    const percent = Number(change[2]);
    return { text: percent === 0 ? `${change[1] === "Route was" ? "Route" : "Trip"} matched the expected ${change[3]}`
      : `${change[1] === "Route was" ? "Route" : "Trip"} ${Math.abs(percent)}% ${percent > 0 ? "longer" : "shorter"} than expected`, icon: change[3] === "distance" ? "route" : "generic" };
  }
  const chat = parseChat(text);
  if (chat) return { text: `${chat.sender[0].toUpperCase()}${chat.sender.slice(1)} said: “${chat.message}”`, icon: "chat" };
  return { text, icon: id.startsWith("TRIP-") ? "route" : id.startsWith("GPS-") ? "pin" : id.startsWith("FARE-") ? "receipt" : id.startsWith("CHAT-") ? "chat" : id.startsWith("HIST-") ? "history" : "info" };
}

// -- Hearing cards (round 8 item 7) ------------------------------------------------------

export const HEARING_INTRO = "Two AI advocates argue for each side, like lawyers. They don't decide: the policy rules do, in the next step.";

/** The flow pills. The Ruling pill names the next step, never its outcome (evidence first). */
export const HEARING_STEPS = [
  { number: 1, label: "Each side makes its case", done: true },
  { number: 2, label: "Each side replies", done: true },
  { number: 3, label: "Ruling: the rules decide", done: false },
] as const;

export const HEARING_ROUNDS = {
  opening: { title: "1 · Each side makes its case", sub: "What each advocate says happened, and the evidence and rule they lean on." },
  replies: { title: "2 · Each side replies", sub: "Each advocate reads the other side's case once and answers its strongest point." },
} as const;

export const NO_RULE_CITED = "None: argues from the facts.";

/** How the Judge read a cited rule, in the Hearing's plain wording. */
export const RULE_CHECK_LABELS: Record<RuleCheck["verdict"], string> = {
  supports: "Rule check: applies to these facts",
  does_not_apply: "Rule check: does not apply",
  favours_other_side: "Rule check: favours the other side",
};

export function partyHeading(side: "rider" | "driver", reply = false): string {
  if (reply) return side === "rider" ? "Rider's reply" : "Driver's reply";
  return side === "rider" ? "For the rider" : "For the driver";
}

const CITATION_ID = /\b(?:TRIP|GPS|FARE|CHAT|HIST)-[1-9]\d*\b/g;
const CITATION_GROUP = /\s*\(\s*(?:TRIP|GPS|FARE|CHAT|HIST)-[1-9]\d*(?:\s*[,;]\s*(?:TRIP|GPS|FARE|CHAT|HIST)-[1-9]\d*)*\s*\)/g;

export type TextPart = { text: string } | { ids: string[] };

/**
 * Splits argument text into plain runs and citation markers: "(TRIP-1, GPS-1)" becomes one
 * marker with both IDs, a bare ID in the sentence becomes a marker of its own. The words and
 * the IDs are the AI's own; only how the IDs are drawn changes.
 */
export function citationParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const pushText = (value: string) => {
    let last = 0;
    for (const match of value.matchAll(CITATION_ID)) {
      if (match.index > last) parts.push({ text: value.slice(last, match.index) });
      parts.push({ ids: [match[0]] });
      last = match.index + match[0].length;
    }
    if (last < value.length) parts.push({ text: value.slice(last) });
  };
  let last = 0;
  for (const match of text.matchAll(CITATION_GROUP)) {
    if (match.index > last) pushText(text.slice(last, match.index));
    parts.push({ ids: match[0].match(CITATION_ID) ?? [] });
    last = match.index + match[0].length;
  }
  if (last < text.length) pushText(text.slice(last));
  return parts;
}

/** Text without its citation codes, for quoting the other side's point. */
export function withoutCitations(text: string): string {
  return text.replace(CITATION_GROUP, "").replace(/\s{2,}/g, " ").trim();
}

/** The small quote a reply opens with: the other side's bottom line, without citation codes. */
export function replyQuote(other: "rider" | "driver", otherSummary: string): string | null {
  const point = withoutCitations(bottomLine(otherSummary).first);
  return point ? `Answering the ${other}: “${point}”` : null;
}

export interface CardFact { id: string | null; text: string; icon: string; only: boolean }

/**
 * Each cited fact once per card, as a short line: facts the argument itself names first,
 * then the rest in the advocate's order. Duplicates (same ID, or the same text without an ID)
 * are merged. `only` marks facts the other side didn't cite, compared by ID when both have IDs.
 */
export function cardFacts(texts: string[], ids: string[], mention: string, other?: { texts: string[]; ids: string[] }): CardFact[] {
  const items = evidenceItems(texts, ids);
  const seen = new Set<string>();
  const unique = items.filter(item => {
    const key = item.id ?? `text:${item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const named = new Set(mention.match(CITATION_ID) ?? []);
  unique.sort((a, b) => Number(!!b.id && named.has(b.id)) - Number(!!a.id && named.has(a.id)));
  const otherItems = other ? evidenceItems(other.texts, other.ids) : [];
  const otherKeys = new Set(otherItems.flatMap(item => item.id ? [item.id, `text:${item.text}`] : [`text:${item.text}`]));
  const compare = otherItems.length > 0;
  return unique.map(item => {
    const shown = hearingFact(item.text, item.id ?? "");
    const only = compare && !otherKeys.has(item.id ?? `text:${item.text}`) && !otherKeys.has(`text:${item.text}`);
    return { id: item.id ?? null, text: shown.text, icon: item.id ? shown.icon : "info", only };
  });
}

/** Facts shown under "Why" before the rest fold away. */
export const WHY_LIMIT = 3;
