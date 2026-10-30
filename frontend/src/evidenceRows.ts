// Display structure only. Original fact strings remain available in the Evidence disclosures.
import { displaySource, parseChat, parseRouteCoverage, parseStop } from "./factVisuals";
import { clockMinutes, labelledTimeline, parseOffRoute } from "./gpsStory";
import { distanceText, trimDecimal } from "./numberFormat";
import type { EvidenceItem } from "./presentation";
import type { DisputeCase } from "./types";

const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const num = (value: string) => Number(value.replace(/,/g, ""));
const signed = (value: number, unit: "km" | "min" | "$") => `${value > 0 ? "+" : value < 0 ? "−" : ""}${unit === "$" ? "$" : ""}${unit === "$" ? Math.abs(value).toFixed(2) : trimDecimal(Math.abs(value))}${unit === "$" ? "" : ` ${unit}`}`;

export function changePill(expected: number, actual: number, unit: "km" | "min" | "$", suppliedPercent?: number) {
  const difference = Number((actual - expected).toPrecision(12));
  const percent = suppliedPercent ?? (expected > 0 ? Math.round((difference / expected) * 100) : null);
  const percentText = percent == null ? "" : ` · ${percent > 0 ? "+" : percent < 0 ? "−" : ""}${Math.abs(percent)}%`;
  return { text: `${signed(difference, unit)}${percentText}`, tone: difference > 0 ? "danger" as const : difference < 0 ? "ok" as const : "neutral" as const };
}

export interface AlignedFact {
  label: string; text: string;
  comparison?: { expected: string; actual: string; change: ReturnType<typeof changePill> };
}
function compared(label: string, expected: number, actual: number, unit: "km" | "min" | "$", percent?: number): AlignedFact {
  const format = (value: number) => unit === "$" ? `$${value.toFixed(2)}` : `${trimDecimal(value)} ${unit}`;
  return { label, text: "", comparison: { expected: format(expected), actual: format(actual), change: changePill(expected, actual, unit, percent) } };
}

/** Only known computed formats are structured; all other facts keep their original text. */
export function alignedFact(fact: EvidenceItem, dispute?: DisputeCase, related: EvidenceItem[] = []): AlignedFact {
  const text = fact.text;
  const tile = /^(?:Route was ([+-]\d+)% vs expected distance|Trip took ([+-]\d+)% vs expected duration)$/.exec(text);
  const record = /^Trip record: (distance|duration) expected ([\d.]+) (km|min), actual ([\d.]+) (?:km|min)$/.exec(text);
  if (record) return compared(record[1] === "distance" ? "Distance" : "Duration", num(record[2]), num(record[4]), record[3] as "km" | "min");
  if (tile) {
    const distance = tile[1] !== undefined;
    const kind = distance ? "distance" : "duration";
    const paired = related.map(item => /^Trip record: (distance|duration) expected ([\d.]+) (km|min), actual ([\d.]+) (?:km|min)$/.exec(item.text)).find(match => match?.[1] === kind);
    const expected = paired ? num(paired[2]) : distance ? dispute?.trip.expected_distance_km : dispute?.trip.expected_duration_min;
    const actual = paired ? num(paired[4]) : distance ? dispute?.trip.actual_distance_km : dispute?.trip.actual_duration_min;
    const percent = Number(tile[1] ?? tile[2]);
    // Don't attach different case values to a percentage fact that doesn't agree with them.
    if (valid(expected) && valid(actual) && expected > 0 && Math.round((actual / expected - 1) * 100) === percent)
      return compared(distance ? "Distance" : "Duration", expected, actual, distance ? "km" : "min", percent);
  }
  const fare = /^Fare: charged \$([\d,.]+), expected \$([\d,.]+)$/.exec(text);
  if (fare) return compared("Fare", num(fare[2]), num(fare[1]), "$");
  const delta = /^Fare was ([+-][\d.]+) vs expected fare$/.exec(text);
  if (delta && valid(dispute?.fare.expected) && valid(dispute?.fare.actual)
    && Math.abs(dispute.fare.actual - dispute.fare.expected - Number(delta[1])) < .005)
    return compared("Fare", dispute.fare.expected, dispute.fare.actual, "$");
  const path = /^GPS path ([\d.]+) km over \d+ points \(([+-]\d+)% vs expected\)$/.exec(text);
  if (path && valid(dispute?.trip.expected_distance_km) && dispute.trip.expected_distance_km > 0
    && Math.round((num(path[1]) / dispute.trip.expected_distance_km - 1) * 100) === Number(path[2]))
    return compared("Route length", dispute.trip.expected_distance_km, num(path[1]), "km", Number(path[2]));
  const item = /^Fare line: (.+) \$([\d,.]+)$/.exec(text);
  if (item) return { label: item[1], text: `$${num(item[2]).toFixed(2)}` };
  const labels: [RegExp, string][] = [
    [/^(Route was|Trip record: distance)/, "Distance"], [/^(Trip took|Trip record: duration)/, "Duration"],
    [/^Driver arrived/, "Arrival"], [/^(Driver waited|Trip record: driver wait)/, "Wait"], [/^Trip record: no-show fee/, "No-show fee"],
    [/^(Rider|Driver) history:/, text.startsWith("Rider") ? "Rider" : "Driver"],
    [/^Rider tone:/, "Rider tone"], [/^Driver tone:/, "Driver tone"], [/^Threatening message:/, "Safety"],
    [/^Disagreement in chat:/, "Disagreement"], [/^Agreement in chat:/, "Agreement"],
    [/^(Driver contacted|No driver contact)/, "Contact"], [/^GPS data gap/, "Data gap"], [/^GPS/, "Readings"],
    [/^(Surge|Fare: surge)/, "Surge"], [/^(Promo|Fare: promo)/, "Promo"], [/^Fare/, "Fare"],
    [/^Charged fare/, "Fare check"], [/^Rider claim:/, "Rider says"], [/^Driver statement:/, "Driver says"],
  ];
  const label = labels.find(([re]) => re.test(text))?.[1] ?? (parseChat(text) ? "Chat" : "Recorded fact");
  // The label replaces only its exact redundant prefix, never a value or quoted message.
  const shown = /^(Rider|Driver) history:/.test(text) ? text.replace(/^(Rider|Driver) history:\s*/, "") : text;
  return { label, text: shown };
}

export function relatedLinkLabel(facts: EvidenceItem[], primary?: EvidenceItem): string {
  const sources = [...new Set(facts.map(displaySource))];
  if (primary && parseStop(primary.text) && sources.every(source => source === "gps")) return `↳ ${facts.length} related GPS ${facts.length === 1 ? "fact" : "facts"}`;
  const names: Record<string, string> = { trip: "Trip", gps: "GPS", fare: "Fare", chat: "Chat", history: "History", case: "case details" };
  const descriptions = facts.map(fact => {
    const text = fact.text;
    if (/^GPS path/.test(text)) return "route length from the GPS trace";
    if (/^Trip record: distance/.test(text)) return "expected and actual route lengths";
    if (/^Trip record: duration/.test(text)) return "expected and actual trip times";
    if (/^GPS .*stops total/.test(text)) return "total time stopped";
    if (parseStop(text)) return "the recorded stop";
    if (/^GPS \d{2}:/.test(text)) return "GPS readings in the recorded time window";
    if (/^Fare: surge/.test(text)) return "the recorded surge multiplier";
    if (/^(Fare: promo|Promo code)/.test(text)) return "the recorded promo discount";
    if (/^Fare was/.test(text)) return "the fare difference";
    return alignedFact(fact).label.toLowerCase();
  });
  return `↳ Also in ${sources.map(source => names[source] ?? source).join(", ")}: ${[...new Set(descriptions)].join("; ")}`;
}

export function rawWindowLabel(text: string, all: string[]): string | null {
  const match = /^GPS (\d{2}:\d{2})-(\d{2}:\d{2}):/.exec(text);
  if (!match) return null;
  const detour = all.map(parseOffRoute).some(off => off?.from === match[1] && off.to === match[2]);
  return `${detour ? "Raw readings during the detour" : "Raw GPS readings"} (${match[1]}–${match[2]})`;
}

export function gpsRow(text: string, all: string[], dispute?: DisputeCase) {
  const timeline = labelledTimeline(dispute?.gps_points ?? [], dispute?.trip.planned_route ?? [], all);
  const total = valid(dispute?.trip.actual_duration_min) && dispute.trip.actual_duration_min > 0 ? dispute.trip.actual_duration_min : timeline?.totalMinutes;
  const off = parseOffRoute(text);
  if (off) {
    const most = total != null && off.minutes <= total && off.minutes > total / 2;
    const duration = most ? "most of the trip" : total != null && off.minutes <= total ? `${off.minutes} of ${trimDecimal(total)} minutes` : `${off.minutes} minutes`;
    return { kind: "off" as const, label: "Off route", value: `${off.minutes} min`, small: total != null ? `of ${trimDecimal(total)}` : "",
      sentence: `Drove away from the planned route for ${duration}.`, detail: `${off.km} km off route · up to ${distanceText(off.awayMetres)} away`, timeline };
  }
  const coverage = parseRouteCoverage(text);
  if (coverage && coverage.total > 0 && coverage.onRoute <= coverage.total) {
    const offCount = coverage.total - coverage.onRoute;
    return { kind: "coverage" as const, label: "Readings off plan", value: `${Math.round(offCount / coverage.total * 100)}%`, small: `${offCount} of ${coverage.total}`,
      sentence: `${offCount} of ${coverage.total} GPS readings were off the planned route.`, detail: "", timeline: null,
      threshold: `Off plan means more than ${coverage.meters} m from the planned route. Each dot represents one recorded GPS reading; off-plan readings are grouped first, not shown in time order.`,
      dots: Array.from({ length: coverage.total }, (_, index) => index < offCount) };
  }
  const stop = parseStop(text);
  if (stop) {
    let start = timeline ? clockMinutes(stop.time) - clockMinutes(timeline.start) : -1;
    if (timeline && start < 0) start += 24 * 60;
    const middle = !!timeline && !/^Driver stopped/.test(text) && start >= timeline.totalMinutes * .1 && start + stop.minutes <= timeline.totalMinutes * .9;
    const where = stop.where ? `, ${stop.where.replace(/ from pickup$/, " from the pickup point")}` : "";
    return { kind: "stop" as const, label: "Stopped", value: `${trimDecimal(stop.minutes)} min`, small: `at ${stop.time}`,
      sentence: `Stopped for ${trimDecimal(stop.minutes)} ${stop.minutes === 1 ? "minute" : "minutes"}${where || (middle ? " in the middle of the trip" : "")}.`, detail: "", timeline, stop };
  }
  return null;
}
