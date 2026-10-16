// Timing for the one-time "Case at a glance" chart intro (CaseComparison.tsx).
// Times are ms from the moment the charts mount; the components pass them to CSS
// as custom properties, so the CSS stays generic. Pure, so it is testable.

/** Each chart starts a little after the one to its left. */
export const CHART_STARTS = { distance: 0, duration: 150, fare: 300 } as const;

export const DISTANCE = {
  lineStart: CHART_STARTS.distance, lineMs: 400, // expected line and the shared part of the actual line
  extraMs: 250,                                   // the thick extra segment, right after the shared part
  pinMs: 150,                                     // end pins pop in as their line lands
  labelMs: 150,                                   // "+4.5 km" rises in after the extra segment
} as const;
export const DISTANCE_EXTRA_START = DISTANCE.lineStart + DISTANCE.lineMs;
export const DISTANCE_LABEL_START = DISTANCE_EXTRA_START + DISTANCE.extraMs;

export const DURATION = {
  expectedStart: CHART_STARTS.duration, expectedMs: 400,
  // The actual trace starts just after the expected line, so the two read as a pair.
  traceStart: CHART_STARTS.duration + 100, traceMs: 600,
  bandMs: 150,  // a stop band fades in as the trace reaches its left edge
  labelMs: 120, // end-time labels fade in as their line finishes
} as const;

export const FARE = {
  expectedStart: CHART_STARTS.fare, expectedMs: 300,
  chargedStart: CHART_STARTS.fare + 50, chargedMs: 350, // segments in order, at one constant speed
  markerMs: 100,
  extraMs: 120,
} as const;
export const FARE_MARKER_START = FARE.chargedStart + FARE.chargedMs;
export const FARE_EXTRA_START = FARE_MARKER_START + FARE.markerMs;

export const INTRO_TOTAL_MS = Math.max(
  DISTANCE_LABEL_START + DISTANCE.labelMs,
  DURATION.traceStart + DURATION.traceMs + DURATION.labelMs,
  DURATION.expectedStart + DURATION.expectedMs + DURATION.labelMs,
  FARE_EXTRA_START + FARE.extraMs,
);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * When the left-to-right trace (linear, `traceMs` long from `startMs`, spanning
 * `left`..`right`) reaches x = `bandX`. Clamped to the trace window.
 */
export function stopDelay(bandX: number, left: number, right: number, traceMs: number, startMs: number): number {
  const fraction = right > left && Number.isFinite(bandX) ? clamp01((bandX - left) / (right - left)) : 0;
  return Math.round(startMs + fraction * traceMs);
}

/** Back-to-back reveals for the charged-fare segments: each takes its share of `totalMs`. */
export function segmentTimings(amounts: number[], startMs: number, totalMs: number): { delay: number; duration: number }[] {
  const total = amounts.reduce((sum, amount) => sum + Math.max(0, amount), 0);
  let at = 0;
  return amounts.map(amount => {
    const share = total > 0 ? Math.max(0, amount) / total : 1 / Math.max(1, amounts.length);
    const timing = { delay: Math.round(startMs + at * totalMs), duration: Math.max(1, Math.round(share * totalMs)) };
    at += share;
    return timing;
  });
}

/** CSS custom properties for one animated element. */
export function introVars(delay: number, duration: number): Record<string, string> {
  return { "--intro-delay": `${delay}ms`, "--intro-dur": `${duration}ms` };
}

// ---- Which cases have played their intro ------------------------------------

export interface SeenStore { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const SEEN_KEY = "triverity.chartIntroSeen";

/**
 * Remembers the dispute IDs whose intro has played in this browser session.
 * Uses sessionStorage when it is available, and always an in-memory set, so a
 * blocked storage still prevents replays for this page load.
 */
export function createSeenCases(storage?: SeenStore | null, key: string = SEEN_KEY) {
  const memory = new Set<string>();
  const read = (): string[] => {
    try { const raw = storage?.getItem(key); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  };
  const has = (id: string) => memory.has(id) || read().includes(id);
  const mark = (id: string) => {
    memory.add(id);
    try { const ids = read(); if (!ids.includes(id)) storage?.setItem(key, JSON.stringify([...ids, id].slice(-200))); }
    catch { /* Storage may be blocked or full; the in-memory set still holds. */ }
  };
  return {
    has,
    mark,
    /** True only the first time for an ID; marks it seen. */
    claim(id: string): boolean { if (has(id)) return false; mark(id); return true; },
  };
}
