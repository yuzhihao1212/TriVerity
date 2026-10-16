// Cited evidence (Hearing and Ruling): a few key facts first, then categories that open on
// click, and which facts only one side cites. Pure functions; every cited fact stays reachable.

import { groupFacts, type FactGroup } from "./factVisuals";
import { fareHeadline } from "./fareStory";
import { gpsHeadline } from "./gpsStory";
import { SOURCE_LABELS, type EvidenceItem } from "./presentation";
import type { DisputeCase } from "./types";

export const CATEGORY_ORDER = ["trip", "gps", "fare", "chat", "history", "case"] as const;
const KEY_SOURCES: Record<string, string[]> = { route_deviation: ["trip", "gps", "fare"], no_show_charge: ["gps", "trip", "chat"] };
const ID_RE = /\b(?:TRIP|GPS|FARE|CHAT|HIST)-[1-9]\d*\b/g;

/**
 * Up to `max` key facts: the facts whose ID the argument mentions, in order of first mention;
 * otherwise the first fact of each main source (after merging duplicates).
 */
export function keyFacts(items: EvidenceItem[], text: string, type: string, max = 3): EvidenceItem[] {
  const mentioned = [...new Set(text.match(ID_RE) ?? [])];
  const byId = mentioned.map(id => items.find(item => item.id === id)).filter((item): item is EvidenceItem => !!item);
  if (byId.length) return byId.slice(0, max);
  const groups = groupFacts(items);
  const order = KEY_SOURCES[type] ?? KEY_SOURCES.route_deviation;
  // Within GPS, what happened (off route, a stop) says more than the coverage count.
  const telling = (group: FactGroup) => /^(Off the planned route|Unexpected stop:|Driver stopped)/.test(group.primary.text) ? 0 : 1;
  return order.map(source => groups.filter(group => group.source === source).sort((a, b) => telling(a) - telling(b))[0]?.primary)
    .filter((item): item is EvidenceItem => !!item).slice(0, max);
}

export interface Category { source: string; label: string; count: number; groups: FactGroup[] }

/** Non-empty categories in a fixed order (trip, GPS, fare, chat, history, case), duplicates merged. */
export function categories(items: EvidenceItem[]): Category[] {
  const groups = groupFacts(items);
  return CATEGORY_ORDER.map(source => {
    const own = groups.filter(group => group.source === source);
    return { source, label: SOURCE_LABELS[source] ?? source, count: own.reduce((sum, group) => sum + 1 + group.related.length, 0), groups: own };
  }).filter(category => category.count > 0);
}

/** One line per category: the GPS and fare headlines, otherwise the count. */
export function categorySummary(category: Pick<Category, "source" | "count" | "groups">, dispute?: Pick<DisputeCase, "fare" | "trip"> | null): string {
  const texts = category.groups.flatMap(group => [group.primary.text, ...group.related.map(item => item.text)]);
  if (category.source === "gps") { const headline = gpsHeadline(texts); if (headline) return headline; }
  if (category.source === "fare" && dispute) { const headline = fareHeadline(dispute, texts); if (headline) return `${headline.lead}${headline.rest}`; }
  return `${category.count} ${category.count === 1 ? "fact" : "facts"}`;
}

/** A party's own claim or statement is theirs alone by nature: not compared. */
const isPartyStatement = (item: EvidenceItem) => /^(Rider claim|Driver statement):/.test(item.text);

export interface SideComparison { same: boolean; count: number; only: Set<string> }

/** Which of `mine` the other side doesn't cite (by text), and whether the two sets are identical. */
export function compareSides(mine: EvidenceItem[], other: EvidenceItem[]): SideComparison {
  const a = new Set(mine.filter(item => !isPartyStatement(item)).map(item => item.text));
  const b = new Set(other.filter(item => !isPartyStatement(item)).map(item => item.text));
  const only = new Set([...a].filter(text => !b.has(text)));
  const same = a.size > 0 && only.size === 0 && [...b].every(text => a.has(text));
  return { same, count: a.size, only };
}
