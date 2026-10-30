import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

import owl from "./assets/mascot/owl.webp";
import wing from "./assets/mascot/owl-wing.webp";
import { ACTION_MS, idleDelay, lookAt, nextIdleAction, tiltToward, type IdleAction } from "./mascotState";

// The owl image is 943 × 877 with its printed pupils painted out; the live pupils are drawn on top
// in the same units. Pupil centres at rest, how far they may travel, and the eye whites for the lids.
const VIEW = { w: 943, h: 877 };
const EYES = [
  { pupil: { x: 342, y: 320 }, white: { cx: 333, cy: 315, rx: 74, ry: 73 } },
  { pupil: { x: 575, y: 357 }, white: { cx: 584, cy: 357, rx: 71, ry: 73 } },
];
const PUPIL_R = 51;
const TRAVEL = 19;
const LID = "#fde3e3";
// The raised wing is its own layer (cut from the same image), so it can wave from its shoulder.
const WING = { x: 0, y: 284, w: 209, h: 344 };

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The TriVerity owl. It feels three-dimensional without a 3D model: it tilts toward the cursor with
 * the light shifting across it, casts a soft shadow, blinks, keeps its raised wing gently moving
 * (and waves with it), and plays a random idle action every few seconds. Its pupils follow the cursor once it comes within reach. `cheer` (a changing key)
 * makes it hop with a burst of sparkles. Decorative: the words it says live in `children`.
 * Reduced motion: still, eyes ahead, no idle actions.
 */
export function Mascot({ size = 120, cheer, className = "", children, bubbleSide = "right" }: {
  size?: number; cheer?: string | number | null; className?: string; children?: ReactNode; bubbleSide?: "right" | "left";
}) {
  const id = useId().replace(/:/g, "");
  const body = useRef<HTMLDivElement>(null);
  const pupils = useRef<(SVGGElement | null)[]>([]);
  const [action, setAction] = useState<IdleAction | null>(null);
  const [blink, setBlink] = useState(false);
  const [burst, setBurst] = useState(0);

  // Eyes and tilt follow the cursor, eased every frame.
  useEffect(() => {
    if (reducedMotion()) return;
    let target = { x: 0, y: 0, rx: 0, ry: 0 }, now = { ...target }, frame = 0;
    function onMove(event: PointerEvent) {
      const box = body.current?.getBoundingClientRect();
      if (!box) return;
      const look = lookAt(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height * .42));
      const tilt = tiltToward(look);
      target = { x: look.x, y: look.y, rx: tilt.rx, ry: tilt.ry };
    }
    function onLeave() { target = { x: 0, y: 0, rx: 0, ry: 0 }; }
    function draw() {
      const k = .14;
      now = { x: now.x + (target.x - now.x) * k, y: now.y + (target.y - now.y) * k, rx: now.rx + (target.rx - now.rx) * k, ry: now.ry + (target.ry - now.ry) * k };
      pupils.current.forEach(node => node?.setAttribute("transform", `translate(${(now.x * TRAVEL).toFixed(2)} ${(now.y * TRAVEL).toFixed(2)})`));
      const el = body.current;
      if (el) {
        el.style.setProperty("--tilt-x", `${now.rx.toFixed(2)}deg`);
        el.style.setProperty("--tilt-y", `${now.ry.toFixed(2)}deg`);
        el.style.setProperty("--light-x", `${(50 - now.x * 22).toFixed(1)}%`);
        el.style.setProperty("--light-y", `${(30 - now.y * 18).toFixed(1)}%`);
      }
      frame = requestAnimationFrame(draw);
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(draw);
    return () => { window.removeEventListener("pointermove", onMove); document.removeEventListener("pointerleave", onLeave); cancelAnimationFrame(frame); };
  }, []);

  // Natural blinks, and one random idle action at a time.
  useEffect(() => {
    if (reducedMotion()) return;
    const timers: number[] = [];
    const later = (ms: number, run: () => void) => { timers.push(window.setTimeout(run, ms)); };
    const blinkOnce = (at = 0) => { later(at, () => setBlink(true)); later(at + 140, () => setBlink(false)); };
    const scheduleBlink = () => later(2600 + Math.random() * 3400, () => { blinkOnce(); scheduleBlink(); });
    let previous: IdleAction | null = null;
    const scheduleAction = () => later(idleDelay(Math.random()), () => {
      const next = nextIdleAction(previous, Math.random());
      previous = next;
      if (next === "blink") blinkOnce();
      else if (next === "double-blink") { blinkOnce(); blinkOnce(260); }
      else { setAction(next); later(ACTION_MS[next], () => setAction(null)); }
      scheduleAction();
    });
    scheduleBlink();
    scheduleAction();
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, []);

  // A cheer: hop with sparkles (once per new key).
  const lastCheer = useRef(cheer);
  useEffect(() => {
    if (cheer == null || cheer === lastCheer.current) return;
    lastCheer.current = cheer;
    if (reducedMotion()) return;
    setBurst(count => count + 1);
    setAction("wave");
    const timer = window.setTimeout(() => setAction(null), ACTION_MS.wave);
    return () => window.clearTimeout(timer);
  }, [cheer]);

  // Hover the owl and it waves back (not while it is already doing something).
  const busy = useRef(false);
  busy.current = action !== null;
  function waveBack() {
    if (busy.current || reducedMotion()) return;
    setAction("wave");
    window.setTimeout(() => setAction(current => current === "wave" ? null : current), ACTION_MS.wave);
  }
  const height = Math.round(size * VIEW.h / VIEW.w);
  return <div className={`mascot bubble-${bubbleSide} ${className}`} style={{ "--mascot-w": `${size}px`, "--mascot-h": `${height}px` } as CSSProperties}>
    <div className="mascot-stage" aria-hidden="true" onPointerEnter={waveBack}>
      <span className="mascot-shadow" />
      <div ref={body} className={`mascot-body${action ? ` is-${action}` : ""}`}>
        <svg className="mascot-svg" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} width={size} height={height} focusable="false">
          <defs>
            {EYES.map((eye, n) => <clipPath key={n} id={`${id}-eye${n}`}><ellipse cx={eye.white.cx} cy={eye.white.cy} rx={eye.white.rx} ry={eye.white.ry} /></clipPath>)}
            <radialGradient id={`${id}-iris`} cx="45%" cy="38%" r="65%">
              <stop offset="0%" stopColor="#6b3622" /><stop offset="55%" stopColor="#3d1c10" /><stop offset="100%" stopColor="#24100a" />
            </radialGradient>
          </defs>
          <image href={owl} width={VIEW.w} height={VIEW.h} />
          <g className="mascot-wing"><image href={wing} x={WING.x} y={WING.y} width={WING.w} height={WING.h} /></g>
          {EYES.map((eye, n) => <g key={n} clipPath={`url(#${id}-eye${n})`}>
            <g className="mascot-glance"><g ref={node => { pupils.current[n] = node; }}>
              <circle cx={eye.pupil.x} cy={eye.pupil.y} r={PUPIL_R} fill={`url(#${id}-iris)`} />
              <circle cx={eye.pupil.x - 17} cy={eye.pupil.y - 20} r={14} fill="#fff" />
              <circle cx={eye.pupil.x + 17} cy={eye.pupil.y + 15} r={6} fill="#fff" opacity={.85} />
            </g></g>
            <rect className={`mascot-lid${blink ? " closed" : ""}`} x={eye.white.cx - eye.white.rx - 4} y={eye.white.cy - eye.white.ry - 4}
              width={eye.white.rx * 2 + 8} height={eye.white.ry * 2 + 8} fill={LID} />
          </g>)}
        </svg>
        <span className="mascot-light" style={{ WebkitMaskImage: `url(${owl})`, maskImage: `url(${owl})` }} />
      </div>
      {burst > 0 && <span className="mascot-burst" key={burst}>{Array.from({ length: 8 }, (_, n) => <i key={n} style={{ "--n": n } as CSSProperties} />)}</span>}
    </div>
    {children && <div className="mascot-bubble">{children}</div>}
  </div>;
}
