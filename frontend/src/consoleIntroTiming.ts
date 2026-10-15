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
  // The hash changes at fade.start, so the console mounts under the overlay.
  fade: { start: 1500, end: 1850 },
} as const;

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
