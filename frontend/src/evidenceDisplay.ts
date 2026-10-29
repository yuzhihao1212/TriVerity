// Display sentences only. Original evidence strings and IDs remain the audit record.
import { parseRouteCoverage, parseChat, type FactGroup } from "./factVisuals";
import { parseOffRoute, pointClock } from "./gpsStory";
import { distanceText, oneDecimal } from "./numberFormat";
import { differenceLabel } from "./tripVisuals";
import type { ChatMessage, Trip } from "./types";

const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
export function gpsReadingsSentence(text: string): string | null {
  const c = parseRouteCoverage(text);
  if (!c || c.total <= 0 || c.onRoute > c.total) return null;
  const off = c.total - c.onRoute;
  return `${off} of ${c.total} GPS readings (${Math.round(off / c.total * 100)}%) were more than ${c.meters} m from the planned route.`;
}
export function distanceLabels(byRoute: number | null, betweenPoints: number | null) {
  return { byRoute: valid(byRoute) ? `${byRoute.toFixed(1)} km by route` : null,
    betweenPoints: valid(betweenPoints) ? `${betweenPoints.toFixed(1)} km between GPS points` : null };
}
export function gpsSummaryLine(text: string): string | null {
  const m = /^GPS (.+?): (\d+) points, moved ([\d.]+) km(?:, speed avg ([\d.]+) km\/h, max ([\d.]+) km\/h)?/.exec(text);
  if (!m) return null;
  const closest = /closest to pickup ([\d.]+) m/.exec(text);
  return [`${m[2]} GPS points`, m[4] ? `average ${m[4]} km/h` : null, m[5] ? `top ${m[5]} km/h` : null,
    distanceLabels(null, Number(m[3])).betweenPoints, closest ? `${closest[1]} m from pickup at the closest point` : null].filter(Boolean).join(" · ");
}
export function gpsFactLine(text: string): string {
  const readings = gpsReadingsSentence(text);
  if (readings) return readings;
  const off = parseOffRoute(text);
  if (off) return `Off route ${off.from}–${off.to}: ${distanceLabels(Number(off.km.replace(/,/g, "")), null).byRoute}, up to ${distanceText(off.awayMetres)} from the planned path.`;
  return gpsSummaryLine(text) ?? text;
}
export function tripNumberLine(trip: Trip | undefined, kind: "distance" | "duration"): string | null {
  const expected = kind === "distance" ? trip?.expected_distance_km : trip?.expected_duration_min;
  const actual = kind === "distance" ? trip?.actual_distance_km : trip?.actual_duration_min;
  if (!valid(expected) || !valid(actual)) return null;
  const unit = kind === "distance" ? "km" : "min";
  return `${oneDecimal(actual)} ${unit}${kind === "distance" ? " driven" : ""} vs ${oneDecimal(expected)} ${unit} expected · ${differenceLabel(expected, actual, unit)}`;
}
export function tripTakeaway(trip?: Trip): string {
  const dimensions = [
    { actual: trip?.actual_distance_km, expected: trip?.expected_distance_km, unit: "km" },
    { actual: trip?.actual_duration_min, expected: trip?.expected_duration_min, unit: "minutes" },
  ].filter((d): d is { actual: number; expected: number; unit: string } => valid(d.actual) && valid(d.expected));
  if (dimensions.length) {
    const differences = dimensions.map(d => ({ ...d, diff: d.actual - d.expected }));
    if (differences.every(d => d.diff === 0)) return dimensions.length === 2 ? "The trip matched the expected distance and time." : "The recorded trip measurement matched what was expected.";
    if (differences.every(d => d.diff > 0) || differences.every(d => d.diff < 0)) {
      return `The trip was ${differences.map(d => `${oneDecimal(Math.abs(d.diff))} ${d.unit === "minutes" && Math.abs(d.diff) === 1 ? "minute" : d.unit}`).join(" and ")} ${differences[0].diff > 0 ? "longer" : "shorter"} than expected.`;
    }
    return "The recorded distance and time are compared with the expected trip below.";
  }
  return valid(trip?.driver_wait_min) ? `The driver waited ${oneDecimal(trip.driver_wait_min)} minutes at pickup.` : "The recorded trip details are shown below.";
}
export function tripFactLine(text: string, trip?: Trip): string {
  if (/^(Route was|Trip record: distance)/.test(text)) return tripNumberLine(trip, "distance") ?? text;
  if (/^(Trip took|Trip record: duration)/.test(text)) return tripNumberLine(trip, "duration") ?? text;
  return text;
}

export function relatedFactsLabel(facts: { source: string }[], topic?: string): string {
  const names: Record<string, string> = { trip: "trip", gps: "GPS", fare: "fare", chat: "chat", history: "history", case: "case details" };
  const topics = topic ?? [...new Set(facts.map(f => names[f.source] ?? f.source))].join(", ");
  return `${facts.length} related ${facts.length === 1 ? "fact" : "facts"}${topics ? `: ${topics}` : ""}`;
}
export function isChatAnalysis(text: string): boolean {
  return /^(?:Rider tone:|Driver tone:|Disagreement in chat:|Agreement in chat:|Threatening message:)/.test(text);
}
export function chatExchange(messages: readonly ChatMessage[] = [], groups: FactGroup[] = []): ChatMessage[] {
  const recorded = messages.filter(m => typeof m.message === "string" && m.message.trim());
  const exchange = [...recorded];
  for (const fact of groups.flatMap(group => [group.primary, ...group.related])) {
    const match = /^Chat (\d{2}:\d{2}) (rider|driver|system):/i.exec(fact.text);
    const parsed = parseChat(fact.text);
    if (!match || !parsed) continue;
    const sender = match[2].toLowerCase() as ChatMessage["sender"];
    const duplicate = exchange.some(m => m.sender === sender && m.message === parsed.message && (!chatTime(m.timestamp) || chatTime(m.timestamp) === match[1]));
    if (!duplicate) exchange.push({ sender, message: parsed.message, timestamp: match[1] });
  }
  return exchange.map((m, index) => ({ m, index })).sort((a, b) => {
    const at = Date.parse(a.m.timestamp ?? ""), bt = Date.parse(b.m.timestamp ?? "");
    if (Number.isFinite(at) && Number.isFinite(bt)) return at - bt || a.index - b.index;
    const ac = chatTime(a.m.timestamp), bc = chatTime(b.m.timestamp);
    return ac && bc ? ac.localeCompare(bc) || a.index - b.index : a.index - b.index;
  }).map(({ m }) => m);
}
/** Attach an existing windowed fact to its exact message; never manufacture an ID. */
export function chatFactsForMessages<T extends { text: string; id?: string }>(messages: readonly ChatMessage[], facts: T[]): (T | undefined)[] {
  const used = new Set<T>();
  return messages.map(message => {
    const fact = facts.find(fact => {
      if (used.has(fact) || !/^Chat \d{2}:\d{2} /.test(fact.text)) return false;
      const parsed = parseChat(fact.text);
      return parsed?.message === message.message && parsed.sender.toLowerCase() === message.sender
        && (!chatTime(message.timestamp) || parsed.label === chatTime(message.timestamp));
    });
    if (fact) used.add(fact);
    return fact;
  });
}
export function chatTakeaway(messages: readonly ChatMessage[]): string {
  if (!messages.length) return "No chat exchange was recorded.";
  const parties = new Set(messages.filter(m => m.sender !== "system").map(m => m.sender));
  if (parties.has("rider") && parties.has("driver")) return `The rider and driver exchanged ${messages.length} messages.`;
  return `The chat record contains ${messages.length} ${messages.length === 1 ? "message" : "messages"}${parties.size === 1 ? ` from the ${[...parties][0]}` : ""}.`;
}
export const chatTime = (timestamp?: string | null) => pointClock(timestamp) ?? (/^\d{2}:\d{2}$/.test(timestamp ?? "") ? timestamp! : null);
