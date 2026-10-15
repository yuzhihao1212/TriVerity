import type { Resolution } from "./types";

export function money(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "Not provided" : `$${value.toFixed(2)}`;
}

export function comparison(expected?: number | null, actual?: number | null) {
  const valid = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  const baseline = valid(expected), observed = valid(actual);
  if (baseline === null && observed === null) return null;
  const max = Math.max(baseline ?? 0, observed ?? 0, 1);
  return {
    expected: baseline, actual: observed,
    expectedWidth: baseline === null ? 0 : baseline / max * 100,
    actualWidth: observed === null ? 0 : observed / max * 100,
    delta: baseline !== null && observed !== null ? observed - baseline : null,
    percent: baseline !== null && baseline > 0 && observed !== null ? (observed / baseline - 1) * 100 : null,
  };
}

export const SOURCE_LABELS: Record<string, string> = {
  trip: "Trip", gps: "GPS", fare: "Fare", chat: "Chat", history: "History", case: "Case evidence",
};
const PREFIX_SOURCE: Record<string, string> = { TRIP: "trip", GPS: "gps", FARE: "fare", CHAT: "chat", HIST: "history" };

export interface EvidenceItem { text: string; id?: string; source: string }

export function evidenceItems(texts: string[], ids: string[] = []): EvidenceItem[] {
  return texts.map((text, index) => {
    // The API sometimes includes an extra party claim in fallback evidence. Do
    // not attach an ID by index unless the entire pair of lists is aligned.
    const candidate = ids.length === texts.length ? ids[index] : undefined;
    const prefix = candidate?.match(/^(TRIP|GPS|FARE|CHAT|HIST)-[1-9]\d*$/)?.[1];
    const id = prefix ? candidate : undefined;
    let source = prefix ? PREFIX_SOURCE[prefix] : "case";
    if (!prefix) {
      if (/^(Route was|Trip took|Driver arrived|Driver waited)/.test(text)) source = "trip";
      else if (/^(GPS |Unexpected stop:|Driver stopped)/.test(text)) source = "gps";
      else if (/^(Fare |Charged fare|Surge |Promo )/.test(text)) source = "fare";
      else if (/^(Threatening message:|Agreement in chat:|Disagreement in chat:|Driver contacted|No driver contact)/.test(text)) source = "chat";
      else if (/^(Rider|Driver) history:/.test(text)) source = "history";
    }
    return { text, id, source };
  });
}

export function policyIds(refs: string[]): string[] {
  return [...new Set(refs.map(ref => ref.split(":", 1)[0].trim()).filter(Boolean))];
}

export function outputSources(resolution: Resolution) {
  return [
    { label: "Rider argument", source: resolution.rider_case.source },
    { label: "Driver argument", source: resolution.driver_case.source },
    { label: "Rider reply", source: resolution.rider_case.rebuttal?.text ? resolution.rider_case.rebuttal.source : null },
    { label: "Driver reply", source: resolution.driver_case.rebuttal?.text ? resolution.driver_case.rebuttal.source : null },
    { label: "Judge explanation", source: resolution.explanation_source },
  ];
}
