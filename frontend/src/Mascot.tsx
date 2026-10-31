import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

import owl from "./assets/mascot/owl.webp";
import wing from "./assets/mascot/owl-wing.webp";
import { ACTION_MS, idleDelay, lookAt, nextIdleAction, registerPoke, RUFFLED_MS, shouldNap, tiltToward, WATCH_LOOK, type IdleAction, type OwlAction } from "./mascotState";

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
 * makes it hop with a burst of sparkles. With `onPoke` it is a button: it hops when clicked and gets
 * ruffled at five quick clicks. `watching` fixes its eyes on the progress bar. `naps` lets it fall
 * asleep when nothing has happened for a minute; any activity wakes it. The words it says live in `children`.
 * Reduced motion: still, eyes ahead, no idle actions and no nap; a click still reaches `onPoke`.
 */
export function Mascot({ size = 120, cheer, className = "", children, bubbleSide = "right", onPoke, pokeLabel, watching = false, naps = false }: {
  size?: number; cheer?: string | number | null; className?: string; children?: ReactNode; bubbleSide?: "right" | "left";
  onPoke?: (ruffled: boolean) => void; pokeLabel?: string; watching?: boolean; naps?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const body = useRef<HTMLDivElement>(null);
  const pupils = useRef<(SVGGElement | null)[]>([]);
  const [action, setAction] = useState<OwlAction | null>(null);
  const [blink, setBlink] = useState(false);
  const [burst, setBurst] = useState(0);
  const [asleep, setAsleep] = useState(false);
  // The running loops read these, so a change doesn't restart them.
  const mode = useRef({ watching, asleep });
  mode.current = { watching, asleep };
  const actionTimer = useRef(0);
  function play(next: OwlAction, ms: number) {
    window.clearTimeout(actionTimer.current);
    setAction(next);
    actionTimer.current = window.setTimeout(() => setAction(null), ms);
  }
  useEffect(() => () => window.clearTimeout(actionTimer.current), []);

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
      const goal = mode.current.asleep ? { x: 0, y: 0, rx: 0, ry: 0 }
        : mode.current.watching ? { x: WATCH_LOOK.x, y: WATCH_LOOK.y, ...tiltToward(WATCH_LOOK) } : target;
      now = { x: now.x + (goal.x - now.x) * k, y: now.y + (goal.y - now.y) * k, rx: now.rx + (goal.rx - now.rx) * k, ry: now.ry + (goal.ry - now.ry) * k };
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
      // Asleep or watching the progress bar, it keeps still.
      if (!mode.current.asleep && !mode.current.watching) {
        const next = nextIdleAction(previous, Math.random());
        previous = next;
        if (next === "blink") blinkOnce();
        else if (next === "double-blink") { blinkOnce(); blinkOnce(260); }
        else play(next, ACTION_MS[next]);
      }
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
    play("wave", ACTION_MS.wave);
  }, [cheer]);

  // A nap: asleep after a quiet minute, and any activity wakes it with a startled hop.
  useEffect(() => {
    if (!naps || reducedMotion()) return;
    let last = Date.now();
    const check = window.setInterval(() => {
      if (shouldNap(Date.now() - last, { naps, watching: mode.current.watching })) setAsleep(true);
    }, 5000);
    function wake() {
      last = Date.now();
      if (!mode.current.asleep) return;
      mode.current.asleep = false;
      setAsleep(false);
      play("hop", ACTION_MS.hop);
    }
    const events = ["pointermove", "pointerdown", "keydown", "scroll"];
    events.forEach(name => window.addEventListener(name, wake, { passive: true, capture: true }));
    return () => { window.clearInterval(check); events.forEach(name => window.removeEventListener(name, wake, { capture: true })); setAsleep(false); };
  }, [naps]);
  // Watching beats sleeping: a run that starts by keyboard or from another tab wakes it.
  useEffect(() => { if (watching) setAsleep(false); }, [watching]);

  // Hover the owl and it waves back (not while it is already doing something).
  const busy = useRef(false);
  busy.current = action !== null;
  function waveBack() {
    if (busy.current || mode.current.watching || reducedMotion()) return;
    play("wave", ACTION_MS.wave);
  }
  const pokes = useRef<number[]>([]);
  function poke() {
    const { times, ruffled } = registerPoke(pokes.current, Date.now());
    pokes.current = times;
    onPoke?.(ruffled);
    if (reducedMotion()) return;
    setBurst(count => count + 1);
    if (ruffled) play("ruffled", RUFFLED_MS); else play("hop", ACTION_MS.hop);
  }
  const height = Math.round(size * VIEW.h / VIEW.w);
  const wrapStage = (stage: ReactNode) => onPoke
    ? <button type="button" className="mascot-stage mascot-poke" aria-label={pokeLabel} title={pokeLabel} onPointerEnter={waveBack} onClick={poke}><span aria-hidden="true">{stage}</span></button>
    : <div className="mascot-stage" aria-hidden="true" onPointerEnter={waveBack}>{stage}</div>;
  return <div className={`mascot bubble-${bubbleSide} ${className}`} style={{ "--mascot-w": `${size}px`, "--mascot-h": `${height}px` } as CSSProperties}>
    {wrapStage(<>
      <span className="mascot-shadow" />
      <div ref={body} className={`mascot-body${action ? ` is-${action}` : ""}${asleep ? " is-asleep" : ""}`}>
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
            <rect className={`mascot-lid${blink || asleep ? " closed" : ""}`} x={eye.white.cx - eye.white.rx - 4} y={eye.white.cy - eye.white.ry - 4}
              width={eye.white.rx * 2 + 8} height={eye.white.ry * 2 + 8} fill={LID} />
            {asleep && <path className="mascot-sleep-eye" d={`M ${eye.white.cx - 42} ${eye.white.cy - 4} Q ${eye.white.cx} ${eye.white.cy + 30} ${eye.white.cx + 42} ${eye.white.cy - 4}`} />}
          </g>)}
        </svg>
        <span className="mascot-light" style={{ WebkitMaskImage: `url(${owl})`, maskImage: `url(${owl})` }} />
      </div>
      {burst > 0 && <span className="mascot-burst" key={burst}>{Array.from({ length: 8 }, (_, n) => <i key={n} style={{ "--n": n } as CSSProperties} />)}</span>}
      {asleep && <span className="mascot-zzz"><i>z</i><i>z</i><i>z</i></span>}
    </>)}
    {children && <div className="mascot-bubble">{children}</div>}
  </div>;
}
