import { useEffect, useRef, useState, type CSSProperties } from "react";
// The timing module has a distinct name: on a case-insensitive file system
// "./consoleIntro" and "./ConsoleIntro" would resolve to the same file.
import { INTRO_STEPS, INTRO_TOTAL_MS, MARK_STAGGER_MS, TRI_LETTER_MS, TRI_LETTERS, triLetterDelay } from "./consoleIntroTiming";

const ms = (value: number) => `${value}ms`;
// Start angles 120° apart on the orbit.
const ORBIT_START = [0, 120, 240];
// The OeroAI mark's circles in its 64-unit viewBox (OeroAI.tsx): rose on top, two ink below.
const MARK_CIRCLES = [{ cx: 17, cy: 45 }, { cx: 47, cy: 45 }, { cx: 32, cy: 17 }];
const MARK_R = 13;

interface Dot { x: number; y: number; r: number; dx: number; dy: number; scale: number; red: boolean }

/**
 * Where a character's dot sits, from drawing it on a canvas: the topmost blob of ink
 * (the dot of an "i", or the whole full stop). Offsets are from the glyph's origin and baseline.
 */
function glyphDot(char: string, font: string, size: number) {
  const pad = Math.ceil(size * .5), w = Math.ceil(size * 1.5), h = Math.ceil(size * 2);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.font = font;
  ctx.fillText(char, pad, h - pad);
  const data = ctx.getImageData(0, 0, w, h).data;
  const inked = (x: number, y: number) => data[(y * w + x) * 4 + 3] > 128;
  let top = -1, bottom = -1, left = w, right = -1;
  for (let y = 0; y < h; y++) {
    let row = false;
    for (let x = 0; x < w; x++) if (inked(x, y)) { row = true; left = Math.min(left, x); right = Math.max(right, x); }
    if (row && top < 0) top = y;
    if (row) bottom = y;
    else if (top >= 0) break;
  }
  if (top < 0) return null;
  return { x: (left + right + 1) / 2 - pad, y: (top + bottom + 1) / 2 - (h - pad), r: (bottom - top + 1) / 2, ascent: ctx.measureText(char).fontBoundingBoxAscent };
}

/** Viewport centre and radius of the dot of the character at `offset` in `node`'s text. */
function dotOnScreen(node: Element, offset: number) {
  const text = node.firstChild;
  if (!text) return null;
  const style = getComputedStyle(node);
  const size = parseFloat(style.fontSize);
  const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const dot = glyphDot(text.textContent?.[offset] ?? "", font, size);
  if (!dot) return null;
  const range = document.createRange();
  range.setStart(text, offset);
  range.setEnd(text, offset + 1);
  const box = range.getBoundingClientRect();
  return { x: box.left + dot.x, y: box.top + dot.ascent + dot.y, r: dot.r };
}

/**
 * Full-screen wordmark intro shown once, from the landing CTA: "TriVerity." forms, then copies
 * of its three dots fly into the OeroAI mark beside "Created by OeroAI". It calls
 * `onNavigate` at the hand-off (the console mounts underneath), then `onDone`
 * when the overlay has faded and should leave the DOM. Esc or a click skips.
 */
export function ConsoleIntro({ onNavigate, onDone }: { onNavigate: () => void; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [dots, setDots] = useState<Dot[]>([]);
  const triI = useRef<HTMLSpanElement>(null);
  const verity = useRef<HTMLSpanElement>(null);
  const stop = useRef<HTMLSpanElement>(null);
  const markSlot = useRef<HTMLSpanElement>(null);
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
    // Once "TriVerity." has formed, copies of its three dots take off for the mark's three circles.
    const peel = window.setTimeout(() => {
      const slot = markSlot.current?.getBoundingClientRect();
      const sources = [triI.current && dotOnScreen(triI.current, 0), verity.current && dotOnScreen(verity.current, 3), stop.current && dotOnScreen(stop.current, 0)];
      if (!slot || sources.some(source => !source)) return;
      const unit = slot.width / 64;
      setDots(sources.map((source, index) => {
        const { x, y, r } = source!;
        const target = MARK_CIRCLES[index];
        return { x, y, r, dx: slot.left + target.cx * unit - x, dy: slot.top + target.cy * unit - y, scale: MARK_R * unit / r, red: index === 2 };
      }));
    }, INTRO_STEPS.mark.start);
    const handoff = window.setTimeout(() => { navigate(); setLeaving(true); }, INTRO_STEPS.fade.start);
    const done = window.setTimeout(() => callbacks.current.onDone(), INTRO_TOTAL_MS);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") skip(); };
    window.addEventListener("keydown", onKey);
    skipRef.current = skip;
    return () => {
      window.clearTimeout(peel);
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
    "--intro-mark-ms": ms(INTRO_STEPS.mark.end - INTRO_STEPS.mark.start - 2 * MARK_STAGGER_MS),
    "--intro-credit-start": ms(INTRO_STEPS.credit.start),
    "--intro-credit-ms": ms(INTRO_STEPS.credit.end - INTRO_STEPS.credit.start),
    "--intro-fade-ms": ms(INTRO_STEPS.fade.end - INTRO_STEPS.fade.start),
  } as CSSProperties;

  return <div className={`console-intro${leaving ? " leaving" : ""}`} aria-hidden="true" style={vars}
    onClick={() => skipRef.current()}>
    {/* A still, invisible copy laid out in the same place: the dots are measured on it, so a
        letter that is still mid-animation can't throw the flight off. */}
    <div className="intro-wordmark intro-ghost">
      {TRI_LETTERS.map(letter => <span className="intro-orbit" key={letter}><span className="intro-arm">
        <span className="intro-letter" ref={letter === "i" ? triI : undefined}>{letter}</span></span></span>)}
      <span className="intro-verity" ref={verity}>Verity</span>
      <span className="intro-dot" ref={stop}>.</span>
    </div>
    <div className="intro-wordmark">
      {TRI_LETTERS.map((letter, index) => <span className="intro-orbit" key={letter}
        style={{ "--intro-angle": `${ORBIT_START[index]}deg`, "--intro-delay": ms(triLetterDelay(index)) } as CSSProperties}>
        <span className="intro-arm"><span className="intro-letter">{letter}</span></span>
      </span>)}
      <span className="intro-verity">Verity</span>
      <span className="intro-dot">.</span>
      <span className="intro-credit">
        <span className="intro-credit-mark" ref={markSlot}><svg viewBox="0 0 64 64"><path className="oero-web" d="M32 20 L18 44 L46 44 Z" /></svg></span>
        <span className="intro-credit-text">Created by <strong>OeroAI</strong></span>
      </span>
    </div>
    {dots.map((dot, index) => <span key={index} className={`intro-fly${dot.red ? " red" : ""}`} style={{
      left: dot.x - dot.r, top: dot.y - dot.r, width: dot.r * 2, height: dot.r * 2,
      "--fly-x": `${dot.dx}px`, "--fly-y": `${dot.dy}px`, "--fly-scale": dot.scale, "--fly-delay": ms(index * MARK_STAGGER_MS),
    } as CSSProperties} />)}
  </div>;
}
