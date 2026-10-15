import type { Theme } from "./theme";

/** Day/night switch: an icon button naming the mode it switches to. */
export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className="icon-button theme-toggle" onClick={onToggle}
      aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {next === "dark"
          ? <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
      </svg>
    </button>
  );
}

/** Presentation mode: an icon button whose pressed state is filled, and announced by aria-pressed. */
export function PresentationToggle({ presentation, onToggle }: { presentation: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="icon-button presentation-toggle" aria-pressed={presentation} onClick={onToggle}
      aria-label="Presentation mode" title="Presentation mode">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {/* A projector screen on a stand. */}
        <path d="M3 4h18M4 4v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V4M12 15v3M8.5 21l3.5-3 3.5 3" />
      </svg>
    </button>
  );
}
