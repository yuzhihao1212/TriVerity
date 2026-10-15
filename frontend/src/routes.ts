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

// IDs are checked against the samples actually returned by the server. A stale
// or unknown link still opens the console, using its usual first selection.
export function selectSample<T extends { dispute_id: string }>(samples: T[], sampleId?: string): T | null {
  return samples.find(sample => sample.dispute_id === sampleId) ?? samples[0] ?? null;
}

/** Smooth, unless the viewer asked for reduced motion. */
export function scrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}

/**
 * Scroll an element into view and move focus to it without a second jump. Smooth by
 * default; `instant` for page changes, where gliding from the old position looks odd.
 */
export function reveal(target: HTMLElement | null | undefined, block: ScrollLogicalPosition = "start", { instant = false } = {}): void {
  if (!target) return;
  target.scrollIntoView({ block, behavior: instant ? "auto" : scrollBehavior(prefersReducedMotion()) });
  target.focus({ preventScroll: true });
}

export function focusSection(id: string, options?: { instant?: boolean }): void {
  reveal(document.getElementById(id), "start", options);
}
