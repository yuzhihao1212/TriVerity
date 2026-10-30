import { parseChat, parseRouteCoverage, parseStop } from "./factVisuals";
import { parseOffRoute } from "./gpsStory";
import { distanceText, trimDecimal } from "./numberFormat";
import { computedFacts, factIndex } from "./presentation";
import type { AgentCase, Resolution } from "./types";

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

/** Facts shown before the remaining citations can be expanded. */
export const GROUP_LIMIT = 4;

/** Compare citations across both rounds; never infer IDs from evidence positions. */
export function comparisonGroups(resolution: Resolution, limit = GROUP_LIMIT) {
  const cited = (item: AgentCase) => new Set([...item.evidence_ids, ...(item.rebuttal?.evidence_ids ?? [])]);
  const rider = cited(resolution.rider_case), driver = cited(resolution.driver_case);
  // Fact text by ID: the Evidence step's facts first (they cover IDs whose text the advocates
  // didn't pair), then the advocates' own pairs. Unknown IDs keep a null text.
  const facts = new Map<string, string>();
  for (const fact of [...factIndex(resolution), ...(resolution.judge_evidence ? computedFacts(resolution) : [])]) {
    if (fact.id && !facts.has(fact.id)) facts.set(fact.id, fact.text);
  }
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
