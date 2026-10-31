import { useId } from "react";

import type { Point, Theme } from "./theme";

/**
 * Day/night switch: an icon button showing the current mode, labelled with the mode it switches to.
 * The sun shrinks its rays away and a shadow slides across it into a crescent moon, and back.
 * It hands its centre to `onToggle`, where the new theme spreads from.
 */
export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: (origin: Point | null) => void }) {
  const next = theme === "dark" ? "light" : "dark";
  const id = useId().replace(/:/g, "");
  return (
    <button type="button" className={`icon-button theme-toggle is-${theme}`} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}
      onClick={event => {
        const box = event.currentTarget.getBoundingClientRect();
        // A keyboard press has no pointer position: the button's centre either way.
        onToggle({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
      }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <defs>
          {/* The shadow that bites the moon out of the sun: it hides the body's outline... */}
          <mask id={`${id}-bite`}><rect x="-2" y="-2" width="28" height="28" fill="#fff" /><circle className="theme-bite" cx="17" cy="7" r="6.5" fill="#000" /></mask>
          <clipPath id={`${id}-body`}><circle className="theme-body" cx="12" cy="12" r="8" /></clipPath>
        </defs>
        {/* Mask and clip sit on groups: on the moving circles they would move with them. */}
        <g mask={`url(#${id}-bite)`}><circle className="theme-body" cx="12" cy="12" r="8" vectorEffect="non-scaling-stroke" /></g>
        {/* ...and draws the moon's inner edge, inside the body only. */}
        <g clipPath={`url(#${id}-body)`}><circle className="theme-bite" cx="17" cy="7" r="6.5" /></g>
        <path className="theme-rays" d="M12 1.5v2M12 20.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M1.5 12h2M20.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
      </svg>
    </button>
  );
}

/** Presentation mode: an icon button whose pressed state is filled, and announced by aria-pressed. */
export function PresentationToggle({ presentation, onToggle }: { presentation: boolean; onToggle: () => void }) {
  return (<>
    {/* Says so on screen too, with a recording-style dot; the button's pressed state already tells screen readers. */}
    {presentation && <span className="presenting-pill" aria-hidden="true"><span className="presenting-dot" />Presenting</span>}
    <button type="button" className="icon-button presentation-toggle" aria-pressed={presentation} onClick={onToggle}
      aria-label="Presentation mode" title="Presentation mode">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {/* A projector screen on a stand. */}
        <path d="M3 4h18M4 4v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V4M12 15v3M8.5 21l3.5-3 3.5 3" />
      </svg>
    </button>
  </>);
}
