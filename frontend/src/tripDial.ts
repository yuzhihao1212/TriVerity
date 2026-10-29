// Pure helpers for the Duration clock dial and the Fare meter (CaseComparison.tsx).

/** Minutes for a full turn of the dial: a clock hour, or whole half-hours for longer trips. */
export function dialMinutes(longestMin: number): number {
  if (!Number.isFinite(longestMin) || longestMin <= 60) return 60;
  return Math.ceil(longestMin / 30) * 30;
}

/** The dial's centre: the time difference in whole minutes, and the words under it. */
export function dialCentre(expectedMin: number | null, actualMin: number | null): { value: string; caption: string } | null {
  if (expectedMin == null || actualMin == null) return actualMin == null ? null : { value: `${Math.round(actualMin)}`, caption: "min" };
  const diff = Math.round(actualMin - expectedMin);
  if (diff === 0) return { value: "0", caption: "min · on time" };
  return { value: `${diff > 0 ? "+" : "−"}${Math.abs(diff)}`, caption: `min ${diff > 0 ? "longer" : "shorter"}` };
}

export type FareDirection = "up" | "down" | "same";

/** How the charged fare compares with the expected one, for the meter's badge. */
export function fareChange(expected: number | null, actual: number | null): { direction: FareDirection; text: string } | null {
  if (expected == null || actual == null) return null;
  const diff = Math.round((actual - expected) * 100) / 100;
  if (diff === 0) return { direction: "same", text: "No change" };
  const percent = expected > 0 ? ` · ${diff > 0 ? "+" : "−"}${Math.round(Math.abs(diff) / expected * 100)}%` : "";
  return { direction: diff > 0 ? "up" : "down", text: `${diff > 0 ? "+" : "−"}$${Math.abs(diff).toFixed(2)}${percent}` };
}
