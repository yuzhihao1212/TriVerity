import { useEffect, useLayoutEffect, useRef } from "react";
// The timing module has a distinct name: on a case-insensitive file system
// "./consoleIntro" and "./ConsoleIntro" would resolve to the same file.
import { INTRO_STEPS, INTRO_TOTAL_MS, INTRO_WORD, LETTER_MS, SWIRL_MS, SWIRL_STAGGER_MS, letterDelay } from "./consoleIntroTiming";

// The OeroAI mark's circles in its 64-unit viewBox (OeroAI.tsx): ink left, ink right, rose on top.
const MARK_CIRCLES = [{ cx: 17, cy: 45 }, { cx: 47, cy: 45 }, { cx: 32, cy: 17 }];
const MARK_R = 13;
// The point the dots circle around: the middle of the three circles.
const MARK_CENTRE = { x: 32, y: 35.67 };
// Which letters carry the dots that fly: the two i's.
const I_INDEXES = [...INTRO_WORD].flatMap((letter, index) => letter === "i" ? [index] : []);
// While the intro plays, the top bar's byline waits for the flying mark.
const HIDE_BYLINE = "intro-byline-hidden";

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
const progress = (t: number, start: number, length: number) => clamp((t - start) / length);

interface Point { x: number; y: number }
interface Dot extends Point { r: number }
interface Box { left: number; top: number; width: number }

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

/** Viewport centre and radius of the dot of the single character in `node`. */
function dotOnScreen(node: Element): Dot | null {
  const text = node.firstChild;
  if (!text) return null;
  const style = getComputedStyle(node);
  const dot = glyphDot(text.textContent ?? "", `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`, parseFloat(style.fontSize));
  if (!dot) return null;
  const range = document.createRange();
  range.selectNodeContents(text);
  const box = range.getBoundingClientRect();
  return { x: box.left + dot.x, y: box.top + dot.ascent + dot.y, r: dot.r };
}

/** A point on a circle-like path around `centre`: the angle and the distance ease together, clockwise. */
function swirl(from: Point, to: Point, centre: Point, t: number): Point {
  const a0 = Math.atan2(from.y - centre.y, from.x - centre.x);
  let turn = Math.atan2(to.y - centre.y, to.x - centre.x) - a0;
  while (turn > 0) turn -= 2 * Math.PI;
  while (turn <= -2 * Math.PI) turn += 2 * Math.PI;
  const r0 = Math.hypot(from.x - centre.x, from.y - centre.y), r1 = Math.hypot(to.x - centre.x, to.y - centre.y);
  const angle = a0 + turn * t, radius = r0 + (r1 - r0) * t;
  return { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius };
}

const markPoint = (box: Box, x: number, y: number): Point => ({ x: box.left + x * box.width / 64, y: box.top + y * box.width / 64 });

/**
 * Full-screen intro shown once per tab, from the landing CTA. "TriVerity." fades in; its three
 * dots then swirl out into the OeroAI mark as the letters dissolve, beside "Created by OeroAI";
 * finally the mark and the name "OeroAI" shrink together into the console top bar's "by OeroAI"
 * while the overlay fades.
 * It calls `onNavigate` at the hand-off (the console mounts underneath), then `onDone` when the
 * overlay should leave the DOM. Esc or a click skips.
 */
export function ConsoleIntro({ onNavigate, onDone }: { onNavigate: () => void; onDone: () => void }) {
  const background = useRef<HTMLDivElement>(null);
  const ghostLetters = useRef<(HTMLSpanElement | null)[]>([]);
  const letters = useRef<(HTMLSpanElement | null)[]>([]);
  const dots = useRef<(HTMLSpanElement | null)[]>([]);
  const credit = useRef<HTMLDivElement>(null);
  const markSlot = useRef<HTMLSpanElement>(null);
  const creditText = useRef<HTMLSpanElement>(null);
  const creditName = useRef<HTMLElement>(null);
  const callbacks = useRef({ onNavigate, onDone });
  callbacks.current = { onNavigate, onDone };

  // Measure on the still copy of the word: where each dot sits, and where to cut the i's dots off
  // the real letters so the dots can leave them.
  const sources = useRef<Dot[]>([]);
  useLayoutEffect(() => {
    const ghost = ghostLetters.current;
    const found = [...I_INDEXES.map(index => ghost[index]), ghost[INTRO_WORD.length]].map(node => node && dotOnScreen(node));
    if (found.some(dot => !dot)) return;
    sources.current = found as Dot[];
    I_INDEXES.forEach((index, n) => {
      // The real letters have no transform yet, so their own boxes are where they will rest.
      const letter = letters.current[index], box = letter?.getBoundingClientRect();
      const dot = sources.current[n];
      if (letter && box) letter.style.clipPath = `inset(${dot.y + dot.r + 1 - box.top}px -1em -1em -1em)`;
    });
    sources.current.forEach((dot, n) => {
      const node = dots.current[n];
      if (!node) return;
      Object.assign(node.style, { left: `${dot.x - dot.r}px`, top: `${dot.y - dot.r}px`, width: `${dot.r * 2}px`, height: `${dot.r * 2}px` });
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(HIDE_BYLINE);
    let navigated = false;
    let frame = 0;
    function navigate() {
      if (navigated) return;
      navigated = true;
      callbacks.current.onNavigate();
    }
    function finish() {
      cancelAnimationFrame(frame);
      root.classList.remove(HIDE_BYLINE);
      navigate();
      callbacks.current.onDone();
    }

    const slotBox = markSlot.current?.getBoundingClientRect();
    const creditBox = credit.current?.getBoundingClientRect();
    // The credit row rises to the middle of the window while the dots travel.
    const lift = creditBox ? creditBox.top + creditBox.height / 2 - window.innerHeight / 2 : 0;
    const restingSlot = (rise: number): Box | null => slotBox ? { left: slotBox.left, top: slotBox.top - lift * rise, width: slotBox.width } : null;
    let flyFrom: Box | null = null;
    let nameFrom: DOMRect | null = null;
    const startedAt = performance.now();

    function draw(now: number) {
      const t = now - startedAt;
      const { stop, swirl: swirlStep, dissolve, credit: creditStep, fly, fade } = INTRO_STEPS;

      letters.current.forEach((letter, index) => {
        if (!letter) return;
        const shown = easeOut(progress(t, letterDelay(index), LETTER_MS));
        const gone = easeOut(progress(t, dissolve.start + index * 35, 600));
        letter.style.opacity = `${shown * (1 - gone)}`;
        letter.style.transform = `translateY(${(1 - shown) * .14 - gone * .1}em)`;
        letter.style.filter = shown < 1 || gone > 0 ? `blur(${((1 - shown) * 6 + gone * 5).toFixed(2)}px)` : "none";
      });

      const rise = easeInOut(progress(t, swirlStep.start, swirlStep.end - swirlStep.start));
      if (credit.current) credit.current.style.transform = `translate(-50%, ${-lift * rise}px)`;
      const fadeIn = easeOut(progress(t, creditStep.start, creditStep.end - creditStep.start));
      const flight = easeInOut(progress(t, fly.start, fly.end - fly.start));
      // "Created by" fades as the flight starts; "OeroAI" travels with the mark (below).
      if (creditText.current) creditText.current.style.opacity = `${fadeIn * (1 - clamp(flight * 2.5))}`;
      if (creditName.current) creditName.current.style.opacity = `${fadeIn}`;
      if (background.current) background.current.style.opacity = `${1 - easeOut(progress(t, fade.start, fade.end - fade.start))}`;

      // Where the mark is now: resting in the credit row, or on its way to the top bar.
      let box = restingSlot(rise);
      let markOpacity = 1;
      if (t >= fly.start) {
        navigate();
        flyFrom ??= box;
        const target = document.querySelector(".topbar .byline .oero-mark")?.getBoundingClientRect();
        const name = creditName.current;
        if (name && !nameFrom) nameFrom = name.getBoundingClientRect();
        const nameTarget = document.querySelector(".topbar .byline strong")?.getBoundingClientRect();
        // Phones keep the byline for screen readers only: then the mark and name stay and fade with the overlay.
        if (flyFrom && target && target.width > 4) {
          box = { left: flyFrom.left + (target.left - flyFrom.left) * flight, top: flyFrom.top + (target.top - flyFrom.top) * flight, width: flyFrom.width + (target.width - flyFrom.width) * flight };
          if (name && nameFrom && nameTarget && nameTarget.height > 0) {
            const scale = 1 + (nameTarget.height / nameFrom.height - 1) * flight;
            name.style.transform = `translate(${(nameTarget.left - nameFrom.left) * flight}px, ${(nameTarget.top - nameFrom.top) * flight}px) scale(${scale})`;
          }
        } else {
          markOpacity = 1 - easeOut(progress(t, fade.start, fade.end - fade.start));
          if (name) name.style.opacity = `${markOpacity}`;
        }
        if (flight >= .9) root.classList.remove(HIDE_BYLINE);
      }
      const slot = markSlot.current;
      if (slot && slotBox && box) {
        slot.style.transform = `translate(${box.left - slotBox.left}px, ${box.top - (slotBox.top - lift * rise)}px) scale(${box.width / slotBox.width})`;
        slot.style.opacity = `${fadeIn * markOpacity}`;
      }

      sources.current.forEach((source, n) => {
        const node = dots.current[n];
        if (!node || !box) return;
        const leaves = swirlStep.start + n * SWIRL_STAGGER_MS;
        if (t < leaves) {
          // Still in the word: the i dots fade in with their letters, the full stop pops in last.
          const shown = n === 2 ? progress(t, stop.start, stop.end - stop.start) : easeOut(progress(t, letterDelay(I_INDEXES[n]), LETTER_MS));
          node.style.opacity = `${shown}`;
          node.style.transform = n === 2 ? `scale(${shown < 1 ? easeOut(shown) * 1.12 : 1})` : `translateY(${(1 - shown) * 14}px)`;
          return;
        }
        const e = easeInOut(progress(t, leaves, SWIRL_MS));
        const target = markPoint(box, MARK_CIRCLES[n].cx, MARK_CIRCLES[n].cy);
        const at = swirl(source, target, markPoint(box, MARK_CENTRE.x, MARK_CENTRE.y), e);
        const radius = source.r + (MARK_R * box.width / 64 - source.r) * e;
        node.style.opacity = `${markOpacity}`;
        node.style.transform = `translate(${at.x - source.x}px, ${at.y - source.y}px) scale(${radius / source.r})`;
        if (n === 2) node.classList.toggle("rose", e > .5);
      });

      if (t >= INTRO_TOTAL_MS) finish();
      else frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);

    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    const overlay = background.current?.parentElement;
    overlay?.addEventListener("click", finish);
    return () => {
      cancelAnimationFrame(frame);
      root.classList.remove(HIDE_BYLINE);
      window.removeEventListener("keydown", onKey);
      overlay?.removeEventListener("click", finish);
    };
  }, []);

  return <div className="console-intro" aria-hidden="true">
    <div className="console-intro-bg" ref={background} />
    {/* A still, invisible copy laid out in the same place: the dots are measured on it. */}
    <div className="intro-wordmark intro-ghost">
      {[...INTRO_WORD, "."].map((letter, index) => <span key={index} ref={node => { ghostLetters.current[index] = node; }}>{letter}</span>)}
    </div>
    <div className="intro-wordmark">
      {[...INTRO_WORD].map((letter, index) => <span key={index} className="intro-letter" ref={node => { letters.current[index] = node; }}>{letter}</span>)}
      {/* Holds the full stop's place; the stop itself is one of the flying dots. */}
      <span className="intro-stop-space">.</span>
    </div>
    <div className="intro-credit" ref={credit}>
      <span className="intro-credit-mark" ref={markSlot}><svg viewBox="0 0 64 64"><path className="oero-web" d="M32 20 L18 44 L46 44 Z" /></svg></span>
      <span className="intro-credit-text" ref={creditText}>Created by</span>
      <strong className="intro-credit-name" ref={creditName}>OeroAI</strong>
    </div>
    {[0, 1, 2].map(n => <span key={n} className={`intro-flying-dot${n === 2 ? " stop" : ""}`} ref={node => { dots.current[n] = node; }} />)}
  </div>;
}
