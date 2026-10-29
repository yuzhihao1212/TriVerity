// Timing for the landing -> console intro (ConsoleIntro.tsx). Times are ms
// from the click. The CSS reads these through custom properties, so this
// module is the single source for the sequence and its tests.

export const TRI_LETTERS = ["T", "r", "i"] as const;
export const TRI_STAGGER_MS = 80;
export const TRI_LETTER_MS = 640;

export const INTRO_STEPS = {
  // Each letter starts TRI_STAGGER_MS after the previous one; the last lands at 800.
  tri: { start: 0, end: (TRI_LETTERS.length - 1) * TRI_STAGGER_MS + TRI_LETTER_MS },
  // Overlaps the end of "Tri" so the sequence reads as one motion.
  verity: { start: 600, end: 1200 },
  dot: { start: 1200, end: 1500 },
  // Copies of the three dots (two i dots and the full stop) peel off and fly into the OeroAI mark.
  mark: { start: 1650, end: 2350 },
  // The mark's triangle and "Created by OeroAI" fade in once the dots land.
  credit: { start: 2250, end: 2650 },
  // The hash changes at fade.start, so the console mounts under the overlay.
  fade: { start: 3300, end: 3650 },
} as const;

// Each flying dot starts this long after the previous one.
export const MARK_STAGGER_MS = 60;

export const INTRO_TOTAL_MS = INTRO_STEPS.fade.end;

// Reduced motion skips the animation and navigates through the link itself.
export const REDUCED_MOTION_MS = 0;

export type IntroStep = keyof typeof INTRO_STEPS;

export function triLetterDelay(index: number): number {
  return INTRO_STEPS.tri.start + index * TRI_STAGGER_MS;
}

/** Plain left-click only: modified or non-primary clicks keep native link behaviour. */
export function shouldPlayIntro(
  event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented?: boolean },
  reducedMotion: boolean,
): boolean {
  if (reducedMotion || event.defaultPrevented) return false;
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

// The intro plays once per tab: sessionStorage is per tab and survives reloads, so a new tab
// plays it again. Blocked storage counts as not played (the caller also remembers it in memory).
export const INTRO_PLAYED_KEY = "triverity.introPlayed";

export function introPlayed(storage: Pick<Storage, "getItem"> | null): boolean {
  try { return storage?.getItem(INTRO_PLAYED_KEY) === "1"; } catch { return false; }
}

export function markIntroPlayed(storage: Pick<Storage, "setItem"> | null): void {
  try { storage?.setItem(INTRO_PLAYED_KEY, "1"); } catch { /* Storage may be blocked. */ }
}
