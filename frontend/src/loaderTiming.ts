// Loader timing, no fake waiting: fast waits show nothing, and a loader once shown stays long
// enough not to flicker. No imports, so tests can load it directly.

/** Show a loader only once a wait has lasted this long. */
export const LOADER_DELAY_MS = 300;
/** Once shown, keep a loader at least this long. */
export const LOADER_MIN_MS = 500;

/** How long to keep a loader shown at `shownAt` (null: never shown) after its wait ended at `now`. */
export function loaderHideDelay(shownAt: number | null, now: number): number {
  return shownAt === null ? 0 : Math.max(0, shownAt + LOADER_MIN_MS - now);
}
