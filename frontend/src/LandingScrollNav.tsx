import { useEffect, useState, type CSSProperties } from "react";
import { Icon } from "./Icon";
import { LANDING_SECTIONS, railFill, readingPosition, type LandingSectionId } from "./landingNav";
import { focusSection, prefersReducedMotion, scrollBehavior } from "./routes";

export const sectionDomId = (id: LandingSectionId) => `section-${id}`;

/** Sits on the seam under the hero: one quiet step into the page. */
export function ScrollCue() {
  return <button type="button" className="landing-scroll-cue" onClick={() => focusSection(sectionDomId("problem"))}>
    See the Problem<Icon name="chevron" />
  </button>;
}

/** The side rail (wide screens) and back to top, both once the reader is past the hero. */
export function LandingScrollNav() {
  const { shown, index, fraction } = useReadingPosition();
  const fill = railFill(index, fraction, LANDING_SECTIONS.length);
  return <>
    <nav className={`landing-rail${shown ? " is-shown" : ""}`} aria-label="Page sections">
      <span className="landing-rail-track" aria-hidden="true"><span className="landing-rail-fill" style={{ "--rail-fill": fill } as CSSProperties} /></span>
      <ol>{LANDING_SECTIONS.map((section, i) => <li key={section.id}>
        <button type="button" className={i < index ? "is-read" : undefined} aria-current={i === index ? "true" : undefined}
          onClick={() => focusSection(sectionDomId(section.id))}>
          <span className="landing-rail-label">{section.label}</span>
        </button>
      </li>)}</ol>
    </nav>
    <button type="button" className={`landing-to-top${shown ? " is-shown" : ""}`} aria-label="Back to Top" title="Back to Top"
      onClick={() => {
        window.scrollTo({ top: 0, behavior: scrollBehavior(prefersReducedMotion()) });
        document.getElementById("landing-title")?.focus({ preventScroll: true });
      }}>
      <Icon name="chevron" />
    </button>
  </>;
}

/** Re-measured on scroll and resize, once a frame: sections change height as tiles open. */
function useReadingPosition() {
  const [position, setPosition] = useState({ shown: false, index: -1, fraction: 0 });
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const boxes = LANDING_SECTIONS.flatMap(section => {
        const rect = document.getElementById(sectionDomId(section.id))?.getBoundingClientRect();
        return rect ? [{ top: rect.top, height: rect.height }] : [];
      });
      if (!boxes.length) return;
      const view = window.innerHeight;
      const atEnd = window.scrollY + view >= document.documentElement.scrollHeight - 2;
      const next = { shown: boxes[0].top <= view * 0.5, ...readingPosition(boxes, view * 0.35, atEnd) };
      setPosition(previous => previous.shown === next.shown && previous.index === next.index
        && Math.abs(previous.fraction - next.fraction) < 0.005 ? previous : next);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return position;
}
