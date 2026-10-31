import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

import belly from "./assets/mascot/owl-belly.webp";
import feet from "./assets/mascot/owl-feet.webp";
import head from "./assets/mascot/owl-head.webp";
import "./mascot.css";
import { THEME_EVENT, type Theme } from "./theme";
import { ACTION_MS, ARRIVAL, idleDelay, lookAt, nextIdleAction, registerPoke, RUFFLED_MS, shouldNap, tiltToward, WATCH_LOOK, type IdleAction, type OwlAction } from "./mascotState";

// The owl is three painted layers (feet, body, head) on one 943 × 877 canvas, plus drawn wings and scarf, with its printed pupils painted out; the live pupils are drawn on top
// in the same units. Pupil centres at rest, how far they may travel, and the eye whites for the lids.
const VIEW = { w: 943, h: 877 };
const EYES = [
  { pupil: { x: 342, y: 320 }, white: { cx: 333, cy: 315, rx: 74, ry: 73 } },
  { pupil: { x: 575, y: 357 }, white: { cx: 584, cy: 357, rx: 71, ry: 73 } },
];
const PUPIL_R = 51;
const TRAVEL = 19;
const LID = "#fee2e3";
// The lids reach a little past the painted whites, so a closed eye shows no white ring.
const LID_MARGIN = 12;

// A wing is drawn for the owl's left side, with its root under the scarf and over the body so no
// gap can open at any angle; the right wing mirrors it across the body's centre.
const MIRROR_X = 864;
const FEATHER = "M300 512C250 518 208 586 203 672C200 726 216 764 238 761C262 757 290 708 304 646C315 596 322 542 300 512Z";
const COVERT = "M300 508C262 514 228 560 226 618C225 656 246 678 268 668C292 656 314 604 317 552C318 528 314 510 300 508Z";

function Wing({ id }: { id: string }) {
  return <>
    {/* The soft shadow it casts on the body. */}
    <path className="owl-wing-shade" d={FEATHER} filter={`url(#${id}-soft)`} />
    {["owl-f-outer", "owl-f-mid", "owl-f-inner"].map(name => <g key={name} className={`owl-feather ${name}`}>
      <path d={FEATHER} fill={`url(#${id}-feather)`} stroke="#4b2d27" strokeWidth={3} strokeOpacity={.45} />
    </g>)}
    <path d={COVERT} fill={`url(#${id}-covert)`} stroke="#4b2d27" strokeWidth={2.5} strokeOpacity={.25} />
  </>;
}

/** The scarf's tail, behind the wing so it trails from under the band. */
function ScarfTail({ id }: { id: string }) {
  return <>
    <path d="M702 498C742 556 776 618 806 682C830 676 852 660 870 638C850 594 800 536 738 500Z" fill="#c9305f" />
    <path d="M700 476C742 500 800 516 858 540C902 558 936 590 941 624C934 652 908 682 886 694C877 678 874 654 868 636C842 590 786 530 716 512Z" fill={`url(#${id}-tail)`} />
    <path d="M722 492C784 510 846 534 896 572" fill="none" stroke="#ff9cb6" strokeWidth={9} strokeLinecap="round" opacity={.4} />
  </>;
}

/** The band around the neck, with its folds, the knot's end and the badge. It sits over the head, which turns inside it. */
function ScarfBand({ id }: { id: string }) {
  return <>
    {/* The shadow it casts up on the face. */}
    <path d="M176 412C240 462 340 498 446 506C560 514 660 488 726 450" fill="none" stroke="#a84a5e" strokeWidth={14} opacity={.32} filter={`url(#${id}-soft)`} />
    <path d="M520 622C560 636 592 656 616 686C624 650 626 610 616 572Z" fill="#c9305f" />
    <path d="M166 436C158 412 170 396 188 408C236 450 332 496 446 508C560 518 660 492 722 448C740 438 750 462 740 486C704 540 624 590 542 612C440 638 298 590 208 524C184 506 172 476 166 436Z" fill={`url(#${id}-scarf)`} />
    <path d="M190 446C262 506 372 548 476 556C592 558 676 522 730 470" fill="none" stroke="#ff8fae" strokeWidth={15} strokeLinecap="round" opacity={.42} />
    <path d="M206 490C282 548 392 592 502 590" fill="none" stroke="#a82450" strokeWidth={6} strokeLinecap="round" opacity={.4} />
    <circle cx={532} cy={584} r={54} fill={`url(#${id}-badge)`} stroke="#c9305f" strokeWidth={2} strokeOpacity={.35} />
    <circle cx={533} cy={566} r={12.5} fill="#d6366b" />
    <circle cx={514} cy={598} r={12.5} fill="#2b2f3a" />
    <circle cx={548} cy={598} r={12.5} fill="#2b2f3a" />
  </>;
}

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The TriVerity owl, rigged from parts: feet, body, head, scarf and two wings move separately, each on its
 * own rhythm. It tilts toward the cursor, its head and pupils
 * follow once the cursor comes within reach, it blinks, and it plays a random idle action every few seconds. `cheer` (a changing key)
 * makes it hop with a burst of sparkles. With `onPoke` it is a button: it hops when clicked and gets
 * ruffled at five quick clicks. `watching` fixes its eyes on the progress bar. `naps` lets it fall
 * asleep when nothing has happened for a minute, sitting down with its wings folded; any activity wakes it. The words it says live in `children`.
 * Reduced motion: still, eyes ahead, no idle actions and no nap; a click still reaches `onPoke`.
 */
// The owl shows once all its layers are ready, so it never appears piece by piece.
const LAYERS = [belly, feet, head];
let layersReady = false;
const layersLoaded = Promise.race([
  Promise.all(LAYERS.map(src => {
    const image = new Image();
    image.src = src;
    return image.decode().catch(() => undefined);
  })),
  // Decoding can stall in a background tab: the owl must never stay hidden.
  new Promise(done => window.setTimeout(done, 1200)),
]).then(() => { layersReady = true; });

export function Mascot({ size = 120, cheer, className = "", children, bubbleSide = "right", onPoke, pokeLabel, watching = false, naps = false, entrance, onArrived }: {
  size?: number; cheer?: string | number | null; className?: string; children?: ReactNode; bubbleSide?: "right" | "left";
  onPoke?: (ruffled: boolean) => void; pokeLabel?: string; watching?: boolean; naps?: boolean;
  /** Fly in, `delay` ms after mounting (the ARRIVAL sequence); `onArrived` runs when it ends or is skipped. */
  entrance?: { delay: number } | null; onArrived?: () => void;
}) {
  const id = useId().replace(/:/g, "");
  const body = useRef<HTMLDivElement>(null);
  const pupils = useRef<(SVGGElement | null)[]>([]);
  const headTrack = useRef<SVGGElement>(null);
  const [action, setAction] = useState<OwlAction | null>(null);
  const [blink, setBlink] = useState(false);
  const [burst, setBurst] = useState(0);
  const [asleep, setAsleep] = useState(false);
  const [loaded, setLoaded] = useState(layersReady);
  useEffect(() => {
    if (loaded) return;
    let live = true;
    void layersLoaded.then(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [loaded]);
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

  // The entrance, played once from mount: CSS flies and lands it; these timers add the sparkles,
  // the blink and the wave. Any click or key skips straight to the owl standing with its line.
  const [arriving, setArriving] = useState(() => !!entrance && !reducedMotion());
  const [arrived, setArrived] = useState(false);
  const arrivedRef = useRef(onArrived);
  arrivedRef.current = onArrived;
  useEffect(() => {
    if (!arriving || !entrance) return;
    const at = (ms: number) => entrance.delay + ms;
    const timers = [
      window.setTimeout(() => setBurst(count => count + 1), at(ARRIVAL.fly)),
      window.setTimeout(() => setBlink(true), at(ARRIVAL.blink)),
      window.setTimeout(() => setBlink(false), at(ARRIVAL.blink + 140)),
      window.setTimeout(() => play("wave", ACTION_MS.wave), at(ARRIVAL.wave)),
      window.setTimeout(finish, at(ARRIVAL.done)),
    ];
    function finish() {
      timers.forEach(timer => window.clearTimeout(timer));
      ["pointerdown", "keydown"].forEach(name => window.removeEventListener(name, finish, true));
      setArriving(false);
      setArrived(true);
      arrivedRef.current?.();
    }
    ["pointerdown", "keydown"].forEach(name => window.addEventListener(name, finish, true));
    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
      ["pointerdown", "keydown"].forEach(name => window.removeEventListener(name, finish, true));
    };
    // Once, from mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // The head turns further than the body, as a real owl's does.
      headTrack.current?.setAttribute("transform", `rotate(${(now.x * 5).toFixed(2)} 440 490) translate(${(now.x * 7).toFixed(2)} ${(now.y * 4).toFixed(2)})`);
      const el = body.current;
      if (el) {
        el.style.setProperty("--tilt-x", `${now.rx.toFixed(2)}deg`);
        el.style.setProperty("--tilt-y", `${now.ry.toFixed(2)}deg`);
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

  // The viewer switches the theme: at night it tilts its head with a slow, sleepy blink; by day it hops up with sparkles.
  useEffect(() => {
    if (reducedMotion()) return;
    const timers: number[] = [];
    function react(event: Event) {
      if (mode.current.watching) return;
      timers.forEach(timer => window.clearTimeout(timer));
      if ((event as CustomEvent<Theme>).detail === "dark") {
        play("tilt", ACTION_MS.tilt);
        timers.push(window.setTimeout(() => setBlink(true), 200), window.setTimeout(() => setBlink(false), 900));
      } else {
        setBurst(count => count + 1);
        play("hop", ACTION_MS.hop);
      }
    }
    window.addEventListener(THEME_EVENT, react);
    return () => { window.removeEventListener(THEME_EVENT, react); timers.forEach(timer => window.clearTimeout(timer)); };
  }, []);

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
  return <div className={`mascot bubble-${bubbleSide}${arriving ? " is-arriving" : ""}${arrived ? " has-arrived" : ""} ${className}`}
    style={{ "--mascot-w": `${size}px`, "--mascot-h": `${height}px`, "--arrive-delay": `${entrance?.delay ?? 0}ms` } as CSSProperties}>
    {wrapStage(<>
      <span className="mascot-shadow" />
      <div ref={body} className={`mascot-body${action ? ` act-${action}` : ""}${asleep ? " is-asleep" : ""}`}>
        <svg className={`owl-svg${loaded ? "" : " is-loading"}`} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} width={size} height={height} focusable="false">
          <defs>
            {EYES.map((eye, n) => <clipPath key={n} id={`${id}-eye${n}`}><ellipse cx={eye.white.cx} cy={eye.white.cy} rx={eye.white.rx + LID_MARGIN} ry={eye.white.ry + LID_MARGIN} /></clipPath>)}
            <linearGradient id={`${id}-feather`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8d5f51" /><stop offset="60%" stopColor="#6f473c" /><stop offset="100%" stopColor="#573630" />
            </linearGradient>
            <linearGradient id={`${id}-covert`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7d5245" /><stop offset="100%" stopColor="#9a6d5e" />
            </linearGradient>
            <linearGradient id={`${id}-scarf`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f0628c" /><stop offset="55%" stopColor="#e34a78" /><stop offset="100%" stopColor="#c9305f" />
            </linearGradient>
            <linearGradient id={`${id}-tail`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#dc3f70" /><stop offset="55%" stopColor="#f2628c" /><stop offset="100%" stopColor="#f97a9e" />
            </linearGradient>
            <radialGradient id={`${id}-badge`} cx="42%" cy="35%" r="75%">
              <stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#f1dfe4" />
            </radialGradient>
            <linearGradient id={`${id}-beak`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffc95f" /><stop offset="100%" stopColor="#f09a24" />
            </linearGradient>
            <filter id={`${id}-soft-sm`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5" /></filter>
            <filter id={`${id}-soft`} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9" /></filter>
            <radialGradient id={`${id}-iris`} cx="45%" cy="38%" r="65%">
              <stop offset="0%" stopColor="#6b3622" /><stop offset="55%" stopColor="#3d1c10" /><stop offset="100%" stopColor="#24100a" />
            </radialGradient>
          </defs>
          <g className="owl-rig">
            <image href={feet} width={VIEW.w} height={VIEW.h} />
            <g className="owl-torso-pose"><g className="owl-torso">
              <g className="owl-tail-pose"><g className="owl-tail"><ScarfTail id={id} /></g></g>
              <g className="owl-belly"><image href={belly} width={VIEW.w} height={VIEW.h} /></g>
              {/* Behind the head layer, so each wing grows from under the scarf. */}
              <g className="owl-wing-l-pose"><g className="owl-wing-l"><Wing id={id} /></g></g>
              <g className="owl-wing-r-pose"><g className="owl-wing-r"><g transform={`translate(${MIRROR_X} 0) scale(-1 1)`}><Wing id={id} /></g></g></g>
              <g className="owl-head-pose"><g ref={headTrack}><g className="owl-head">
                <image href={head} width={VIEW.w} height={VIEW.h} />
                {/* Asleep the beak is shut: the open mouth is painted in, so a closed one is drawn over it. */}
                {asleep && <g className="owl-closed-beak">
                  <ellipse cx={451} cy={420} rx={60} ry={50} fill="#fde0df" filter={`url(#${id}-soft-sm)`} />
                  <path d="M450 351C477 351 499 372 497 393C491 411 470 434 451 438C431 434 410 411 405 393C403 372 424 351 450 351Z" fill={`url(#${id}-beak)`} />
                  <path d="M450 358C447 382 448 408 451 432" fill="none" stroke="#e08a1c" strokeWidth={4} strokeLinecap="round" opacity={.45} />
                </g>}
                {EYES.map((eye, n) => <g key={n} clipPath={`url(#${id}-eye${n})`}>
                  <g className="owl-glance"><g ref={node => { pupils.current[n] = node; }}>
                    <circle cx={eye.pupil.x} cy={eye.pupil.y} r={PUPIL_R} fill={`url(#${id}-iris)`} />
                    <circle cx={eye.pupil.x - 17} cy={eye.pupil.y - 20} r={14} fill="#fff" />
                    <circle cx={eye.pupil.x + 17} cy={eye.pupil.y + 15} r={6} fill="#fff" opacity={.85} />
                  </g></g>
                  <rect className={`mascot-lid${blink || asleep ? " closed" : ""}`} x={eye.white.cx - eye.white.rx - LID_MARGIN} y={eye.white.cy - eye.white.ry - LID_MARGIN}
                    width={eye.white.rx * 2 + LID_MARGIN * 2} height={eye.white.ry * 2 + LID_MARGIN * 2} fill={LID} />
                  {asleep && <path className="mascot-sleep-eye" d={`M ${eye.white.cx - 42} ${eye.white.cy - 4} Q ${eye.white.cx} ${eye.white.cy + 30} ${eye.white.cx + 42} ${eye.white.cy - 4}`} />}
                </g>)}
              </g></g></g>
              <g className="owl-band"><ScarfBand id={id} /></g>
            </g></g>
          </g>
        </svg>
      </div>
      {burst > 0 && <span className="mascot-burst" key={burst}>{Array.from({ length: 8 }, (_, n) => <i key={n} style={{ "--n": n } as CSSProperties} />)}</span>}
      {asleep && <span className="mascot-zzz"><i>z</i><i>z</i><i>z</i></span>}
    </>)}
    {children && <div className="mascot-bubble">{children}</div>}
  </div>;
}
