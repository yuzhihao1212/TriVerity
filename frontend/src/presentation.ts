import type { DisputeCase, Resolution } from "./types";

export function disputeLabel(dispute: Pick<DisputeCase, "label" | "rider_claim">): string {
  return dispute.label?.trim() || dispute.rider_claim;
}

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

export function factIndex(resolution: Resolution): EvidenceItem[] {
  const candidates = new Map<string, EvidenceItem>();
  const conflicts = new Set<string>();
  for (const item of [resolution.rider_case, resolution.driver_case]) {
    for (const fact of [
      ...evidenceItems(item.evidence, item.evidence_ids),
      ...evidenceItems(item.rebuttal?.evidence ?? [], item.rebuttal?.evidence_ids ?? []),
    ]) {
      if (!fact.id) continue;
      const previous = candidates.get(fact.id);
      if (previous && previous.text !== fact.text) conflicts.add(fact.id);
      else candidates.set(fact.id, fact);
    }
  }
  return [...candidates.values()].filter(fact => !conflicts.has(fact.id!));
}

export function filterDisputes<T extends { type: string }>(cases: T[], type: string): T[] {
  return type === "all" ? cases : cases.filter(item => item.type === type);
}

export function readPresentationPreference(storage: Pick<Storage, "getItem">): boolean {
  try { return storage.getItem("triverity.presentation") === "true"; }
  catch { return false; }
}

export function writePresentationPreference(storage: Pick<Storage, "setItem">, enabled: boolean): void {
  try { storage.setItem("triverity.presentation", String(enabled)); }
  catch { /* Presentation still works for this session if storage is blocked. */ }
}


export function computedFacts(resolution: Resolution): EvidenceItem[] {
  const referenced = factIndex(resolution);
  const byText = new Map<string, EvidenceItem[]>();
  for (const fact of referenced) byText.set(fact.text, [...(byText.get(fact.text) ?? []), fact]);
  const usedIds = new Set<string>();
  const computed = evidenceItems(resolution.judge_evidence).map(fact => {
    const matches = byText.get(fact.text) ?? [];
    if (matches.length !== 1 || !matches[0].id || usedIds.has(matches[0].id)) return fact;
    usedIds.add(matches[0].id);
    return { ...fact, id: matches[0].id, source: matches[0].source };
  });
  const texts = new Set(computed.map(fact => fact.text));
  // Keep explicitly paired reference facts even if the Judge's evidence subset
  // did not include them. Never derive IDs from position or source counters.
  return [...computed, ...referenced.filter(fact => !texts.has(fact.text))];
}
