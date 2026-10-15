// Display-only parsing of computed fact sentences (backend/app/services/evidence.py
// and data_sources.py). The sentences themselves are cited verbatim by the agents
// and the Judge, so nothing here may change, drop or reorder a fact's text: every
// helper only adds structure for rendering, and anything it cannot parse falls
// back to the original sentence.

import type { EvidenceItem } from "./presentation";

export type Tone = "warn" | "ok" | "neutral";
export type ValueKind = "percent" | "money" | "minutes" | "distance" | "speed" | "clock" | "multiplier";
export type FactPart =
  | { kind: "text"; text: string }
  | { kind: "value"; text: string; raw: string; value: ValueKind; tone: Tone };

export const SOURCE_ORDER = ["trip", "gps", "fare", "chat", "history", "case"] as const;

// Order matters: longer forms first so "08:05-08:32" is not split into two clocks,
// "42 km/h" is not read as "42 km", and "$3.10" is not read as a bare number.
const VALUE_RE = new RegExp([
  String.raw`(?<speed>\d+(?:\.\d+)? km/h)`,
  String.raw`(?<clock>\b\d{2}:\d{2}(?:-\d{2}:\d{2})?\b)`,
  String.raw`(?<money>[+-]?\$\d[\d,]*(?:\.\d+)?)`,
  String.raw`(?<signedMoney>[+-]\d+\.\d{2}(?= vs\b))`,
  String.raw`(?<percent>[+-]?\d+(?:\.\d+)?%)`,
  String.raw`(?<minutes>\b\d+(?:\.\d+)? min\b)`,
  String.raw`(?<distance>\b\d[\d,]*(?:\.\d+)? (?:km|m)\b)`,
  String.raw`(?<multiplier>\bx\d+(?:\.\d+)?\b)`,
].join("|"), "g");

const OK_RE = /(matches the charged fare|^Driver contacted rider|consistent with the multiplier|discount reflected in the charge|^Agreement in chat)/;
const WARN_RE = /(^Unexpected stop:|^GPS stop:|unexpected stops total|^Off the planned route|^Threatening message:|^Disagreement in chat:|not reflected in the charge|inconsistent with the multiplier|^GPS data gap)/;
const STOP_RE = /^(?:Unexpected stop: (?<d1>\d+(?:\.\d+)?) min at (?<t1>\d{2}:\d{2})|GPS stop: (?<d2>\d+(?:\.\d+)?) min from (?<t2>\d{2}:\d{2})|Driver stopped (?<d3>\d+(?:\.\d+)?) min at (?<t3>\d{2}:\d{2}))/;

/** A positive deviation in a "vs expected" / "vs the itemised breakdown" fact. */
function positiveDeviation(text: string): boolean {
  const match = /([+-])(\d+(?:\.\d+)?)%? vs (?:expected|the itemised)/.exec(text) ?? /\(([+-])(\d+(?:\.\d+)?)% vs expected\)/.exec(text);
  return !!match && match[1] === "+" && Number(match[2]) > 0;
}

export function factTone(text: string): Tone {
  if (OK_RE.test(text)) return "ok";
  if (/stops total 0 min$/.test(text)) return "neutral"; // No unexpected stopping at all.
  if (WARN_RE.test(text) || positiveDeviation(text)) return "warn";
  return "neutral";
}

/** "+6.30" -> "+$6.30"; "$3.10" stays. */
export function formatMoney(raw: string): string {
  return /^[+-]\d/.test(raw) ? `${raw[0]}$${raw.slice(1)}` : raw;
}

/**
 * Split a fact into text and value runs. Joining the `raw` of value runs with
 * the text runs gives back the original sentence exactly. A quoted chat message
 * is never parsed: its numbers are the sender's words, not computed values.
 */
export function factParts(text: string): { tone: Tone; parts: FactPart[] } {
  const tone = factTone(text);
  const quote = text.indexOf('"');
  const parsed = quote === -1 ? text : text.slice(0, quote);
  const parts: FactPart[] = [];
  let last = 0;
  for (const match of parsed.matchAll(VALUE_RE)) {
    const groups = match.groups ?? {};
    const kind = (Object.keys(groups).find(key => groups[key] !== undefined) ?? "percent") as ValueKind | "signedMoney";
    const value: ValueKind = kind === "signedMoney" ? "money" : kind;
    const raw = match[0];
    // Only the deviation itself (or a stop's duration) carries the warning;
    // a path length or a clock time beside it stays neutral.
    const signed = /^[+-]/.test(raw);
    const valueTone: Tone = tone === "ok" ? "ok"
      : tone === "warn" && (signed || (value === "minutes" && /stop/i.test(text))) ? "warn" : "neutral";
    if (match.index! > last) parts.push({ kind: "text", text: parsed.slice(last, match.index) });
    parts.push({ kind: "value", raw, text: value === "money" ? formatMoney(raw) : raw, value, tone: valueTone });
    last = match.index! + raw.length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return { tone, parts };
}

/** The card a fact is shown in. Some facts arrive without an ID prefix and so land in "case". */
export function displaySource(fact: EvidenceItem): string {
  if (fact.source !== "case") return fact.source;
  if (/^Trip record:/.test(fact.text)) return "trip";
  if (/^(GPS |Off the planned route)/.test(fact.text)) return "gps";
  if (/^(Fare[: ]|Charged fare )/.test(fact.text)) return "fare";
  if (/^(Chat \d{2}:\d{2}|(Rider|Driver) tone:)/.test(fact.text)) return "chat";
  return "case";
}

// ---- Stops, GPS route coverage, trip tiles -------------------------------

export interface Stop { minutes: number; time: string; /** e.g. "87 m from the pickup point" */ where?: string }
export function parseStop(text: string): Stop | null {
  const match = STOP_RE.exec(text);
  const g = match?.groups;
  if (!match || !g) return null;
  const where = text.slice(match[0].length).replace(/^,\s*/, "").trim();
  return { minutes: Number(g.d1 ?? g.d2 ?? g.d3), time: (g.t1 ?? g.t2 ?? g.t3)!, ...(where ? { where } : {}) };
}

export interface RouteCoverage { meters: number; onRoute: number; total: number; percent: number }
export function parseRouteCoverage(text: string): RouteCoverage | null {
  const match = /^GPS within (\d+) m of the planned route for (\d+) of (\d+) points$/.exec(text);
  if (!match) return null;
  const [meters, onRoute, total] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return { meters, onRoute, total, percent: total ? Math.round((onRoute / total) * 100) : 0 };
}

export interface Tile { key: string; label: string; value: string; detail: string; tone: Tone }
const TILE_PATTERNS: { key: string; re: RegExp; label: string; detail: string }[] = [
  { key: "distance", re: /^Route was ([+-]\d+%) vs expected distance$/, label: "Distance", detail: "vs expected distance" },
  { key: "duration", re: /^Trip took ([+-]\d+%) vs expected duration$/, label: "Duration", detail: "vs expected duration" },
  { key: "arrival", re: /^Driver arrived (\d+ m) from pickup point$/, label: "Driver arrived", detail: "from the pickup point" },
  { key: "wait", re: /^Driver waited (\d+(?:\.\d+)? min) at pickup$/, label: "Driver waited", detail: "at pickup" },
];
export function parseTile(text: string): Tile | null {
  for (const pattern of TILE_PATTERNS) {
    const match = pattern.re.exec(text);
    if (match) return { key: pattern.key, label: pattern.label, value: match[1], detail: pattern.detail, tone: factTone(text) };
  }
  return null;
}
/** "Trip record: distance expected 10.2 km, actual 14.7 km" -> the matching tile key and "10.2 → 14.7 km". */
export function parseTripRecord(text: string): { key: string; detail: string } | null {
  const match = /^Trip record: (distance|duration) expected ([\d.]+) (km|min), actual ([\d.]+) (?:km|min)$/.exec(text);
  return match ? { key: match[1], detail: `Expected ${match[2]} → actual ${match[4]} ${match[3]}` } : null;
}

// ---- Chat ---------------------------------------------------------------

export interface ChatBubble { label: string; sender: string; message: string; tone: Tone }
export function parseChat(text: string): ChatBubble | null {
  const flagged = /^(Threatening message|Agreement in chat|Disagreement in chat): ([^:]+): "(.*)"$/s.exec(text);
  if (flagged) return { label: flagged[1].replace(" in chat", ""), sender: flagged[2], message: flagged[3], tone: factTone(text) };
  const windowed = /^Chat (\d{2}:\d{2}) ([^:]+): "(.*)"$/s.exec(text);
  if (windowed) return { label: windowed[1], sender: windowed[2], message: windowed[3], tone: "neutral" };
  return null;
}

// ---- Fare receipt -------------------------------------------------------

const toCents = (amount: string) => Math.round(Number(amount.replace(/,/g, "")) * 100);
export const centsToMoney = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

export interface Receipt {
  lines: { fact: EvidenceItem; label: string; cents: number }[];
  /** Sum of the itemised lines less any promo discount; null without any lines. */
  totalCents: number | null;
  charged?: { fact: EvidenceItem; cents: number; expectedCents?: number };
  /** A promo discount, which reduces the charge below the itemised lines. */
  discount?: { fact: EvidenceItem; code: string; cents: number };
  difference?: { fact: EvidenceItem; text: string; tone: Tone };
  note?: { fact: EvidenceItem; ok: boolean };
  others: EvidenceItem[];
}

export function fareReceipt(facts: EvidenceItem[]): Receipt {
  const receipt: Receipt = { lines: [], totalCents: null, others: [] };
  for (const fact of facts) {
    const line = /^Fare line: (.+) \$(\d[\d,]*\.\d{2})$/.exec(fact.text);
    const charged = /^Fare: charged \$(\d[\d,]*\.\d{2})(?:, expected \$(\d[\d,]*\.\d{2}))?$/.exec(fact.text);
    const difference = /^Fare was ([+-]\d+\.\d{2}) vs expected fare$/.exec(fact.text);
    const promo = /^(?:Fare: promo (\S+) \(\$(\d[\d,]*\.\d{2}) off\)|Promo code (\S+) applied \((\d[\d,]*\.\d{2}) off\))$/.exec(fact.text);
    const mismatch = /^Charged fare is [+-]\d+\.\d{2} vs the itemised breakdown$/.test(fact.text);
    if (line) receipt.lines.push({ fact, label: line[1], cents: toCents(line[2]) });
    else if (charged && !receipt.charged) receipt.charged = { fact, cents: toCents(charged[1]), expectedCents: charged[2] ? toCents(charged[2]) : undefined };
    else if (promo && !receipt.discount) receipt.discount = { fact, code: (promo[1] ?? promo[3])!, cents: toCents((promo[2] ?? promo[4])!) };
    else if (difference && !receipt.difference) receipt.difference = { fact, text: `${formatMoney(difference[1])} vs expected`, tone: factTone(fact.text) };
    else if ((fact.text === "Fare breakdown matches the charged fare" || mismatch) && !receipt.note) receipt.note = { fact, ok: !mismatch };
    else receipt.others.push(fact);
  }
  if (receipt.lines.length) receipt.totalCents = receipt.lines.reduce((sum, line) => sum + line.cents, 0) - (receipt.discount?.cents ?? 0);
  return receipt;
}

// ---- Grouping duplicates --------------------------------------------------

/** One displayed row: `primary` is rendered, `related` are revealed verbatim on demand. */
export interface FactGroup { primary: EvidenceItem; related: EvidenceItem[]; source: string }

function groupKey(fact: EvidenceItem): string | null {
  const stop = parseStop(fact.text);
  if (stop) return `stop:${stop.time}:${stop.minutes}`;
  const distance = /^(?:Route was ([+-]\d+%) vs expected distance|GPS path [\d.]+ km over \d+ points \(([+-]\d+%) vs expected\))$/.exec(fact.text);
  if (distance) return `distance:${distance[1] ?? distance[2]}`;
  const record = parseTripRecord(fact.text);
  if (record) return `record:${record.key}`;
  const surge = /^(?:Surge pricing applied: x|Fare: surge multiplier x)(\d+(?:\.\d+)?)$/.exec(fact.text);
  if (surge) return `surge:${surge[1]}`;
  const promo = /^(?:Fare: promo (\S+) \(\$|Promo code (\S+) applied \()(\d[\d,]*\.\d{2}) off\)$/.exec(fact.text);
  if (promo) return `promo:${promo[1] ?? promo[2]}:${promo[3]}`;
  return null;
}

// Which member of a group is shown: the evidence.py sentence before the
// evidence-agent tool lines, and the trip statement before its GPS/record echo.
function rank(fact: EvidenceItem): number {
  if (/^(Unexpected stop:|Driver stopped|Route was|Trip took|Surge pricing applied|Promo code)/.test(fact.text)) return 0;
  if (/^GPS stop:/.test(fact.text)) return 1;
  return 2;
}

/**
 * Collapse facts that state the same thing. Every input fact appears exactly
 * once in the output, either as a primary or as a related fact, in a stable
 * order (groups appear where their first member did).
 */
export function groupFacts(facts: EvidenceItem[]): FactGroup[] {
  const tileKeys = new Map<string, string>(); // "distance" -> group key of its tile
  for (const fact of facts) {
    const tile = parseTile(fact.text);
    if (tile && (tile.key === "distance" || tile.key === "duration")) tileKeys.set(tile.key, groupKey(fact) ?? `tile:${tile.key}`);
  }
  const keyOf = (fact: EvidenceItem) => {
    const record = parseTripRecord(fact.text);
    if (record && tileKeys.has(record.key)) return tileKeys.get(record.key)!; // Joins its tile.
    const tile = parseTile(fact.text);
    if (tile && tile.key === "duration") return tileKeys.get("duration")!;
    return groupKey(fact);
  };
  const buckets = new Map<string, EvidenceItem[]>();
  const order: (string | EvidenceItem)[] = [];
  for (const fact of facts) {
    const key = keyOf(fact);
    if (!key) { order.push(fact); continue; }
    if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
    buckets.get(key)!.push(fact);
  }
  // A single stop's total ("GPS unexpected stops total 6 min") repeats that stop.
  const stopKeys = [...buckets.keys()].filter(key => key.startsWith("stop:"));
  const groups = order.map(entry => {
    if (typeof entry !== "string") return { primary: entry, related: [] as EvidenceItem[] };
    const members = [...buckets.get(entry)!].sort((a, b) => rank(a) - rank(b));
    return { primary: members[0], related: members.slice(1) };
  });
  if (stopKeys.length === 1) {
    const minutes = Number(stopKeys[0].split(":").at(-1));
    const stopGroup = groups.find(group => groupKey(group.primary) === stopKeys[0])!;
    for (let i = groups.length - 1; i >= 0; i--) {
      const total = /^GPS (?:unexpected|observed) stops total (\d+(?:\.\d+)?) min$/.exec(groups[i].primary.text);
      if (total && Number(total[1]) === minutes && !groups[i].related.length) {
        stopGroup.related.push(groups[i].primary);
        groups.splice(i, 1);
      }
    }
  }
  return groups.map(group => ({ ...group, source: displaySource(group.primary) }));
}
