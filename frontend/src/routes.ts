export type Route = { page: "landing" } | { page: "console"; sampleId?: string };

export function parseRoute(hash: string): Route {
  const match = /^#\/console(?:\/([^/]+))?$/.exec(hash);
  if (!match) return { page: "landing" };
  try {
    return match[1] ? { page: "console", sampleId: decodeURIComponent(match[1]) } : { page: "console" };
  } catch {
    return { page: "landing" };
  }
}

// IDs are checked against the samples actually returned by the server. No ID shows the
// reviewer's home (the queue); an unknown ID shows home too, with a "not found" note.
export function selectSample<T extends { dispute_id: string }>(samples: T[], sampleId?: string): T | null {
  return sampleId ? samples.find(sample => sample.dispute_id === sampleId) ?? null : null;
}

/** The ID of a case link that matches no case (for the home page's note), else null. */
export function missingCase<T extends { dispute_id: string }>(samples: T[], sampleId?: string): string | null {
  return sampleId && !samples.some(sample => sample.dispute_id === sampleId) ? sampleId : null;
}

export const HOME_HASH = "#/console";
export const caseHash = (id: string) => `#/console/${encodeURIComponent(id)}`;

/** Smooth, unless the viewer asked for reduced motion. */
export function scrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}

/**
 * Scroll an element into view and move focus to it without a second jump. Smooth by
 * default; `instant` for page changes, where gliding from the old position looks odd.
 */
export function reveal(target: HTMLElement | null | undefined, block: ScrollLogicalPosition = "start",
  { instant = false, flash = false } = {}): void {
  if (!target) return;
  target.scrollIntoView({ block, behavior: instant ? "auto" : scrollBehavior(prefersReducedMotion()) });
  target.focus({ preventScroll: true });
  if (flash) flashTarget(target);
}

export const FLASH_MS = 1600;

/**
 * Briefly highlight a jump target, so an in-page link visibly lands even when there is
 * little or nothing to scroll. A glow that fades; a still outline under reduced motion.
 */
function flashTarget(target: HTMLElement): void {
  target.classList.remove("jump-flash");
  void target.offsetWidth; // restart the highlight if the same link is used twice
  target.classList.add("jump-flash");
  window.setTimeout(() => target.classList.remove("jump-flash"), FLASH_MS);
}

export function focusSection(id: string, options?: { instant?: boolean; flash?: boolean }): void {
  reveal(document.getElementById(id), "start", options);
}
