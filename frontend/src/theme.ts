export type Theme = "light" | "dark";
export const THEME_KEY = "triverity.theme";

/** The viewer's saved choice, or null if they never chose (then the system setting applies). */
export function readTheme(storage: Pick<Storage, "getItem">): Theme | null {
  try {
    const value = storage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch { return null; }
}

export function writeTheme(storage: Pick<Storage, "setItem">, theme: Theme): void {
  try { storage.setItem(THEME_KEY, theme); } catch { /* Still switches for this session if storage is blocked. */ }
}

export function resolveTheme(saved: Theme | null, systemDark: boolean): Theme {
  return saved ?? (systemDark ? "dark" : "light");
}

/** Sent on window when the viewer switches the theme themselves (not when the system setting changes), so the owl can react. */
export const THEME_EVENT = "triverity:theme";
export const REVEAL_MS = 650;

export interface Point { x: number; y: number }
/** How far the new theme's circle must grow from `origin` to cover the whole viewport. */
export function revealRadius(origin: Point, viewport: { width: number; height: number }): number {
  return Math.ceil(Math.hypot(Math.max(origin.x, viewport.width - origin.x), Math.max(origin.y, viewport.height - origin.y)));
}

type TransitionDocument = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } };

/**
 * Run `update` (which switches the theme) so the new theme spreads in a circle from `origin`, the toggle.
 * Browsers without view transitions, and viewers who reduce motion, get the instant switch.
 */
export function revealTheme(update: () => void, origin: Point | null): void {
  const doc = document as TransitionDocument;
  if (!origin || !doc.startViewTransition || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { update(); return; }
  const radius = revealRadius(origin, { width: window.innerWidth, height: window.innerHeight });
  const at = `at ${Math.round(origin.x)}px ${Math.round(origin.y)}px`;
  doc.startViewTransition(update).ready.then(() => {
    document.documentElement.animate({ clipPath: [`circle(0px ${at})`, `circle(${radius}px ${at})`] },
      { duration: REVEAL_MS, easing: "cubic-bezier(.65, 0, .35, 1)", pseudoElement: "::view-transition-new(root)" });
  }).catch(() => { /* Skipped (e.g. the tab was hidden): the theme has switched anyway. */ });
}

/** Pin the theme on <html>; styles.css reads data-theme before the system setting. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}
