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

/** Pin the theme on <html>; styles.css reads data-theme before the system setting. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}
