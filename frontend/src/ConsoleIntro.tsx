import { useEffect, useRef, useState, type CSSProperties } from "react";
// The timing module has a distinct name: on a case-insensitive file system
// "./consoleIntro" and "./ConsoleIntro" would resolve to the same file.
import { INTRO_STEPS, INTRO_TOTAL_MS, TRI_LETTER_MS, TRI_LETTERS, triLetterDelay } from "./consoleIntroTiming";

const ms = (value: number) => `${value}ms`;
// Start angles 120° apart on the orbit.
const ORBIT_START = [0, 120, 240];

/**
 * Full-screen wordmark intro shown once, from the landing CTA. It calls
 * `onNavigate` at the hand-off (the console mounts underneath), then `onDone`
 * when the overlay has faded and should leave the DOM. Esc or a click skips.
 */
export function ConsoleIntro({ onNavigate, onDone }: { onNavigate: () => void; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const navigated = useRef(false);
  const skipRef = useRef<() => void>(() => {});
  const callbacks = useRef({ onNavigate, onDone });
  callbacks.current = { onNavigate, onDone };

  useEffect(() => {
    function navigate() {
      if (navigated.current) return;
      navigated.current = true;
      callbacks.current.onNavigate();
    }
    function skip() {
      navigate();
      callbacks.current.onDone();
    }
    const handoff = window.setTimeout(() => { navigate(); setLeaving(true); }, INTRO_STEPS.fade.start);
    const done = window.setTimeout(() => callbacks.current.onDone(), INTRO_TOTAL_MS);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") skip(); };
    window.addEventListener("keydown", onKey);
    skipRef.current = skip;
    return () => {
      window.clearTimeout(handoff);
      window.clearTimeout(done);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const vars = {
    "--intro-letter-ms": ms(TRI_LETTER_MS),
    "--intro-verity-start": ms(INTRO_STEPS.verity.start),
    "--intro-verity-ms": ms(INTRO_STEPS.verity.end - INTRO_STEPS.verity.start),
    "--intro-dot-start": ms(INTRO_STEPS.dot.start),
    "--intro-dot-ms": ms(INTRO_STEPS.dot.end - INTRO_STEPS.dot.start),
    "--intro-fade-ms": ms(INTRO_STEPS.fade.end - INTRO_STEPS.fade.start),
  } as CSSProperties;

  return <div className={`console-intro${leaving ? " leaving" : ""}`} aria-hidden="true" style={vars}
    onClick={() => skipRef.current()}>
    <div className="intro-wordmark">
      {TRI_LETTERS.map((letter, index) => <span className="intro-orbit" key={letter}
        style={{ "--intro-angle": `${ORBIT_START[index]}deg`, "--intro-delay": ms(triLetterDelay(index)) } as CSSProperties}>
        <span className="intro-arm"><span className="intro-letter">{letter}</span></span>
      </span>)}
      <span className="intro-verity">Verity</span>
      <span className="intro-dot">.</span>
    </div>
  </div>;
}
