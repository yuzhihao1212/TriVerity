import { useEffect, useRef, useState, type CSSProperties } from "react";

import { LOADER_DELAY_MS, loaderHideDelay } from "./loaderTiming";
import { prefersReducedMotion } from "./routes";

// The OeroAI mark (design B, flat) and the loaders made from it. The colours and the flat
// animation live in index.html, so the pre-app splash works before this bundle loads.

/** The three circles: rose on top, two ink circles below, a pale triangle behind. Decorative. */
function Trio({ className }: { className: string }) {
  return <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g className="oero-trio">
    <path className="oero-web" d="M32 20 L18 44 L46 44 Z" />
    <circle className="oero-top" cx="32" cy="17" r="13" />
    <circle className="oero-left" cx="17" cy="45" r="13" />
    <circle className="oero-right" cx="47" cy="45" r="13" />
  </g></svg>;
}

export function OeroMark() {
  return <Trio className="oero-mark" />;
}

/** True while `active`, but only after LOADER_DELAY_MS, and then for at least LOADER_MIN_MS. */
export function useLoaderVisible(active: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    const timer = active
      ? window.setTimeout(() => { shownAt.current = performance.now(); setVisible(true); }, LOADER_DELAY_MS)
      : window.setTimeout(() => { shownAt.current = null; setVisible(false); }, loaderHideDelay(shownAt.current, performance.now()));
    return () => window.clearTimeout(timer);
  }, [active]);
  return visible;
}

/** The flat loader for inline waits (16–40 px): separate, orbit 120°, rejoin with red on top. */
export function FlatLoader({ className }: { className?: string }) {
  return <Trio className={className ? `oero-mark oero-loader ${className}` : "oero-mark oero-loader"} />;
}

/** A 16 px flat loader for a button whose request is pending; the button's own text says what is happening. */
export function ButtonLoader({ busy }: { busy: boolean }) {
  return useLoaderVisible(busy) ? <FlatLoader className="button-loader" /> : null;
}

const PERIOD_MS = 2400;
const BASE = [[0, 18.67], [-15, -9.33], [15, -9.33]];
const WEB = [[0, 15.67], [-14, -8.33], [14, -8.33]];
const COLOURS = {
  light: { red: [232, 54, 95], ink: [43, 47, 54], ballShadow: 0.14 },
  dark: { red: [255, 120, 156], ink: [225, 228, 234], ballShadow: 0.35 },
};
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ramp = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const ease = (x: number) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const mix = (a: number[], b: number[], f: number) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const shade = (c: number[]) => `radial-gradient(circle at 34% 30%, ${rgb(mix(c, [255, 255, 255], .45))} 0%, ${rgb(c)} 42%, ${rgb(mix(c, [0, 0, 0], .35))} 100%)`;

/**
 * The 3D loader for full-area waits (about 100–240 px): the spheres part, tilt back and orbit 120°
 * in perspective, handing the colour over mid-orbit, then rejoin with red on top. Plain JS and CSS
 * (projected positions, gradient shading, z-order by depth); reduced motion: an opacity pulse only.
 */
export function Loader3D({ size = 120 }: { size?: number }) {
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    const balls = [...root.querySelectorAll<HTMLElement>(".oero-ball")];
    const web = root.querySelector("polygon")!, floor = root.querySelector<HTMLElement>(".oero-floor")!;
    const theme = document.documentElement.dataset.theme;
    const dark = theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const colours = dark ? COLOURS.dark : COLOURS.light;
    const reduce = prefersReducedMotion();
    const k = size / 240, scale = 3.2 * k, cx = 120 * k, cy = 118 * k, radius = 13, depth = 160;
    const project = (x: number, y: number, angle: number, tilt: number, spread: number) => {
      x *= spread; y *= spread;
      const xr = x * Math.cos(angle) - y * Math.sin(angle), yr = x * Math.sin(angle) + y * Math.cos(angle);
      const z = -yr * Math.sin(tilt), p = depth / (depth - z);
      return { x: cx + xr * scale * p, y: cy - yr * Math.cos(tilt) * scale * p, p, z };
    };
    let frame = 0;
    const draw = (now: number) => {
      const t = (now % PERIOD_MS) / PERIOD_MS;
      const part = reduce ? 0 : ease(ramp(t, .08, .28)) - ease(ramp(t, .72, .92));
      const tilt = reduce ? 0 : ease(ramp(t, .14, .36)) - ease(ramp(t, .64, .86));
      const spin = reduce ? 0 : ease(ramp(t, .12, .88)), handover = reduce ? 0 : ease(ramp(t, .40, .60));
      const angle = -spin * 2 * Math.PI / 3, spread = 1 + .38 * part, shrink = 1 - .4 * part, lean = 1.05 * tilt;
      const fills = [mix(colours.red, colours.ink, handover), mix(colours.ink, colours.red, handover), colours.ink];
      BASE.forEach(([x, y], i) => {
        const q = project(x, y, angle, lean, spread), r = radius * scale * shrink * q.p, ball = balls[i];
        Object.assign(ball.style, {
          width: `${2 * r}px`, height: `${2 * r}px`, left: `${q.x - r}px`, top: `${q.y - r}px`, zIndex: String(Math.round(100 + q.z)),
          background: shade(fills[i]), boxShadow: `0 ${4 * q.p * k}px ${10 * q.p * k}px rgba(0,0,0,${colours.ballShadow})`,
          opacity: reduce ? String(.6 + .4 * Math.abs(Math.cos(now / 700))) : "",
        });
      });
      web.setAttribute("points", WEB.map(([x, y]) => { const q = project(x, y, angle, lean, spread); return `${q.x},${q.y}`; }).join(" "));
      web.style.opacity = String(1 - part);
      floor.style.transform = `scaleX(${1 + .25 * part}) scaleY(${1 + 1.4 * tilt})`;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [size]);
  return <div ref={stage} className="oero-loader-3d" style={{ width: size, height: size, "--k": size / 240 } as CSSProperties} aria-hidden="true">
    <span className="oero-floor" />
    <svg width={size} height={size}><polygon className="oero-web" /></svg>
    <span className="oero-ball" /><span className="oero-ball" /><span className="oero-ball" />
  </div>;
}
