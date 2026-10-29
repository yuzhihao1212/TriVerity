// "How the evidence was gathered": a plain summary of the evidence collector's lookups and the
// grouping for its audit trail. The fallback's literal "default plan" reason is never shown.
// Pure functions.

import type { ToolCallRecord } from "./types";

export const DEFAULT_PLAN = "default plan";
export const AUDIT_OPEN_KEY = "triverity.auditTrail";
export const FALLBACK_EXPLANATION = "Fallback: AI was off or unavailable, so standard lookups were used for both parties.";

type Collection = { source: "llm" | "fallback"; calls?: ToolCallRecord[] | null } | null | undefined;

const PHRASES: Record<string, string> = {
  trip_record: "trip details", gps_window: "GPS readings", gps_stops: "GPS stops", fare_lines: "fare breakdown",
  chat_window: "chat messages", app_events: "app events",
};
const NAMES: Record<string, string> = {
  trip_record: "Trip record", gps_window: "GPS", gps_stops: "GPS stops", fare_lines: "Fare breakdown", chat_window: "Chat", app_events: "App events",
};
const CARDS: Record<string, string> = { trip: "Trip card", gps: "GPS card", fare: "Fare card", chat: "Chat card", history: "History card" };

const titleCase = (tool: string) => { const words = tool.replace(/[_-]+/g, " ").trim(); return words ? words[0].toUpperCase() + words.slice(1) : "Lookup"; };
const windowOf = (call: Pick<ToolCallRecord, "args">) => call.args?.start && call.args?.end ? ` (${call.args.start}–${call.args.end})` : "";

/** "Chat (08:05–08:32)", "Trip record". Never snake_case. */
export function lookupName(call: Pick<ToolCallRecord, "tool" | "args">): string {
  return `${Object.hasOwn(NAMES, call.tool) ? NAMES[call.tool] : titleCase(call.tool)}${windowOf(call)}`;
}
/** "GPS readings (08:05–08:32)", "fare breakdown": for sentences. */
export function lookupPhrase(call: Pick<ToolCallRecord, "tool" | "args">): string {
  return `${Object.hasOwn(PHRASES, call.tool) ? PHRASES[call.tool] : titleCase(call.tool).toLowerCase()}${windowOf(call)}`;
}

export function isDefaultPlan(reason: string | null | undefined): boolean {
  return (reason ?? "").trim().toLowerCase() === DEFAULT_PLAN;
}

/** The reason as shown: "Standard lookup (AI off)" for the fallback plan, null when empty. */
export function lookupReason(reason: string | null | undefined): string | null {
  if (isDefaultPlan(reason)) return "Standard lookup (AI off)";
  const text = (reason ?? "").trim();
  return text ? text : null;
}

/** The first clause of a reason, at most `max` characters, with "…" when cut. */
export function shortReason(reason: string, max = 80): string {
  const first = reason.trim().split(/(?<=[.;!?])\s|\s[—–-]\s|,\s/)[0].replace(/[.;!?]$/, "");
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

/** "a, b and c". */
export function listText(items: string[]): string {
  const unique = [...new Set(items)];
  return unique.length <= 1 ? unique.join("") : `${unique.slice(0, -1).join(", ")} and ${unique.at(-1)}`;
}

const signature = (call: Pick<ToolCallRecord, "tool" | "args">) =>
  `${call.tool}|${JSON.stringify(Object.entries(call.args ?? {}).sort(([a], [b]) => a.localeCompare(b)))}`;

export interface LookupRow { key: string; calls: ToolCallRecord[]; parties: ("rider" | "driver")[] }
export interface LookupRound { round: number; both: LookupRow[]; rider: LookupRow[]; driver: LookupRow[] }

/** Identical lookups (same tool and args) on both sides once under "Both sides"; the rest by side. */
export function mergeLookups(calls: ToolCallRecord[]): LookupRound[] {
  const rounds = [...new Set(calls.map(call => call.round))].sort((a, b) => a - b);
  return rounds.map(round => {
    const inRound = calls.filter(call => call.round === round);
    const bySide = (party: "rider" | "driver") => inRound.filter(call => call.party === party);
    const rider = bySide("rider"), driver = bySide("driver");
    const both: LookupRow[] = [];
    const used = new Set<ToolCallRecord>();
    for (const call of rider) {
      const twin = driver.find(other => !used.has(other) && signature(other) === signature(call));
      if (twin) { used.add(call); used.add(twin); both.push({ key: `${round}-${signature(call)}`, calls: [call, twin], parties: ["rider", "driver"] }); }
    }
    // Calls with no party are not one side's: list them with the shared lookups.
    for (const call of inRound.filter(call => call.party !== "rider" && call.party !== "driver")) {
      used.add(call); both.push({ key: `${round}-${signature(call)}-x`, calls: [call], parties: [] });
    }
    const row = (call: ToolCallRecord, party: "rider" | "driver"): LookupRow => ({ key: `${round}-${party}-${signature(call)}`, calls: [call], parties: [party] });
    return { round, both,
      rider: rider.filter(call => !used.has(call)).map(call => row(call, "rider")),
      driver: driver.filter(call => !used.has(call)).map(call => row(call, "driver")) };
  });
}

/** "2 facts" -> "Trip card" (the card's stable id), or null for an unknown source. */
export function lookupTarget(call: Pick<ToolCallRecord, "source" | "results">): { count: string; card: string; id: string } | null {
  if (!Object.hasOwn(CARDS, call.source)) return null;
  const n = call.results.length;
  return { count: `${n} ${n === 1 ? "fact" : "facts"}`, card: CARDS[call.source], id: `evidence-source-${call.source}` };
}

export interface CollectionSummary { lead: string; rest: string }

/** One or two plain sentences: what was looked up, for whom, and why (when the AI said why). */
export function collectionSummary(collection: Collection): CollectionSummary {
  const calls = collection?.calls ?? [];
  if (!calls.length) return { lead: "No extra evidence was requested.", rest: "" };
  const first = Math.min(...calls.map(call => call.round));
  const opening = calls.filter(call => call.round === first);
  const later = calls.filter(call => call.round !== first);
  const followUp = later.length ? ` Then a follow-up ${later.length === 1 ? "lookup" : "lookups"}: ${listText(later.map(lookupPhrase))}.` : "";
  const standard = collection?.source === "fallback" || calls.every(call => isDefaultPlan(call.reason));
  const side = (party: "rider" | "driver") => opening.filter(call => call.party === party);
  const rider = side("rider"), driver = side("driver");
  const same = rider.length === driver.length && rider.every(call => driver.some(other => signature(other) === signature(call)));
  if (standard) return { lead: "AI was off, so both sides got the standard lookups:", rest: ` ${listText(opening.map(lookupPhrase))}.${followUp}` };
  if (same || !rider.length || !driver.length) {
    const who = !rider.length ? "The driver" : !driver.length ? "The rider" : "Both sides";
    return { lead: `${who} asked for`, rest: ` ${listText(opening.map(lookupPhrase))}.${followUp}` };
  }
  const describe = (label: string, own: ToolCallRecord[]) => {
    const reason = own.map(call => call.reason).find(reason => reason && !isDefaultPlan(reason));
    return `${label}: ${listText(own.map(lookupPhrase))}${reason ? ` (${shortReason(reason)})` : ""}.`;
  };
  return { lead: "Each side asked for its own lookups.", rest: ` ${describe("Rider", rider)} ${describe("Driver", driver)}${followUp}` };
}

/** "First lookups" / "Follow-up lookups", only when there is more than one round. */
export function roundLabel(index: number, total: number): string | null {
  if (total <= 1) return null;
  return index === 0 ? "First lookups" : "Follow-up lookups";
}
