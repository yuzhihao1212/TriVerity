// Timing for the landing -> console intro (ConsoleIntro.tsx). Times are ms
// from the click. ConsoleIntro's animation loop reads them, so this module is
// the single source for the sequence and its tests.

export const INTRO_WORD = "TriVerity";
// Letters fade and rise in one after another (quicker since 30 Oct: the word forms in about 0.65 s).
export const LETTER_STAGGER_MS = 30;
export const LETTER_MS = 400;
// The three dots leave one after another, each on a circular path into the OeroAI mark.
export const SWIRL_STAGGER_MS = 110;
export const SWIRL_MS = 1600;

export const INTRO_STEPS = {
  letters: { start: 0, end: (INTRO_WORD.length - 1) * LETTER_STAGGER_MS + LETTER_MS },
  // The full stop arrives last, with a soft pop.
  stop: { start: 650, end: 900 },
  // The two i dots and the full stop swirl into the mark; the credit row rises to the centre with them.
  swirl: { start: 1000, end: 1000 + 2 * SWIRL_STAGGER_MS + SWIRL_MS },
  // As the dots leave, the letters dissolve left to right.
  dissolve: { start: 1150, end: 1150 + (INTRO_WORD.length - 1) * 35 + 600 },
  // The mark's triangle and "Created by OeroAI" fade in as the dots settle.
  credit: { start: 2500, end: 3000 },
  // The hash changes at fly.start, so the console mounts under the overlay; the mark and the name
  // "OeroAI" then shrink together into the top bar's "by OeroAI" while the background fades.
  fly: { start: 3300, end: 4000 },
  fade: { start: 3300, end: 3750 },
} as const;

export const INTRO_TOTAL_MS = INTRO_STEPS.fly.end + 100;

export function letterDelay(index: number): number {
  return INTRO_STEPS.letters.start + index * LETTER_STAGGER_MS;
}

// Reduced motion skips the animation and navigates through the link itself.
export const REDUCED_MOTION_MS = 0;

export type IntroStep = keyof typeof INTRO_STEPS;

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
