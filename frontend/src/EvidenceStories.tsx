import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

import { createSeenCases } from "./chartIntro";
import { COUNT_UP_MS, countUpText, EVIDENCE_SEEN_KEY, parseCountTarget } from "./countUp";
import {
  labelledTimeline, timelineClock, timelineTicks, labelRows, nearestPointIndex, offRouteFlags, projectRoutes, ROUTE_SEEN_KEY, routeRuns, sketchLabel,
  stopFacts, totalOffMinutes, type Timeline,
} from "./gpsStory";
import { iconStrokes } from "./Icon";
import { distanceText, trimDecimal } from "./numberFormat";
import { PICKUP_LIMIT_M, pickupLayout, readingMarks } from "./pickupSketch";
import { metres, polyline, type GpsPoint, type LatLng } from "./tripVisuals";
import type { Trip } from "./types";

// ---- Once per case per session -------------------------------------------------

const stores = new Map<string, ReturnType<typeof createSeenCases>>();
function seenStore(key: string) {
  if (!stores.has(key)) {
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* Blocked: memory only. */ }
    stores.set(key, createSeenCases(storage, key));
  }
  return stores.get(key)!;
}
const reducedMotion = () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

/**
 * True when this case's intro should play: not seen this session and motion allowed. Decided
 * once at mount (so a re-render never replays it) and marked seen in an effect (StrictMode safe).
 */
export function useIntroOnce(key: string, caseId: string | undefined): boolean {
  const [play] = useState(() => !!caseId && !reducedMotion() && !seenStore(key).has(caseId));
  useEffect(() => { if (play && caseId) seenStore(key).mark(caseId); }, [play, key, caseId]);
  return play;
}
export const useEvidenceIntro = (caseId?: string) => useIntroOnce(EVIDENCE_SEEN_KEY, caseId);
export const useRouteIntro = (caseId?: string) => useIntroOnce(ROUTE_SEEN_KEY, caseId);

// ---- Count-up -------------------------------------------------------------------

/** "+0%" -> "+44%" in about 600 ms, once; screen readers get the final value only. */
export function CountUp({ value, play }: { value: string; play: boolean }) {
  const target = parseCountTarget(value);
  const [text, setText] = useState(() => play && target ? countUpText(target, 0) : value);
  useEffect(() => {
    if (!play || !target) { setText(value); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      setText(countUpText(target, elapsed));
      if (elapsed < COUNT_UP_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, value]);
  return <><span className="count-up" aria-hidden="true" style={{ minWidth: `${value.length}ch` }}>{text}</span><span className="sr-only">{value}</span></>;
}

// ---- Route sketch ---------------------------------------------------------------

const W = 640, H = 320;

/** Planned route (dashed), the driven line (amber where off route) and stop pins. No tiles. */
export function RouteSketch({ caseId, points, planned, facts }: { caseId: string; points: GpsPoint[]; planned: LatLng[]; facts: string[] }) {
  const clip = useId().replace(/:/g, "");
  const play = useRouteIntro(caseId);
  const usable = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  // Nothing to draw when the car never moved (e.g. a driver waiting at a no-show).
  if (usable.length < 2 || usable.every(p => metres(p, usable[0]) < 30)) return null;
  const hasPlan = planned.length >= 2;
  const flags = offRouteFlags(usable, hasPlan ? planned : []);
  const runs = routeRuns(flags);
  const projected = projectRoutes(hasPlan ? planned : [], usable, W, H, 22);
  const stops = stopFacts(facts).map(stop => ({ stop, index: nearestPointIndex(usable, stop.time) })).filter(item => item.index >= 0);
  const label = sketchLabel(totalOffMinutes(facts), stops.map(item => item.stop), hasPlan);
  const start = projected.actual[0], end = projected.actual.at(-1)!;
  return <figure className={`route-sketch${play ? " route-intro" : ""}`}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <defs><clipPath id={clip}><rect className="route-reveal" x="0" y="0" width={W} height={H} /></clipPath></defs>
      {hasPlan && <path className="route-planned" d={polyline(projected.planned)} />}
      <g clipPath={`url(#${clip})`}>
        {runs.map((run, index) => <path key={index} className={`route-driven${run.off ? " off" : ""}`}
          d={polyline(projected.actual.slice(run.from, run.to + 1))} />)}
        {stops.map(({ stop, index }) => { const p = projected.actual[index]; const below = p.y < 40; return <g key={`${stop.time}-${stop.minutes}`} className="route-stop">
          <circle cx={p.x} cy={p.y} r="6" />
          <rect x={Math.max(36, Math.min(W - 36, p.x)) - 34} y={(below ? p.y + 22 : p.y - 12) - 17} width={68} height={24} rx={4} />
          <text x={Math.max(36, Math.min(W - 36, p.x))} y={below ? p.y + 22 : p.y - 12} textAnchor="middle">{stop.minutes} min</text>
        </g>; })}
      </g>
      <circle className="route-pin start" cx={start.x} cy={start.y} r="6" />
      <circle className="route-pin end" cx={end.x} cy={end.y} r="6" />
    </svg>
    <figcaption className="route-legend" aria-hidden="true">
      {hasPlan && <span><i className="legend-planned" />Planned route</span>}
      <span><i className="legend-driven" />Driven</span>
      {hasPlan && flags.some(Boolean) && <span><i className="legend-off" />Off route</span>}
      {!!stops.length && <span><i className="legend-stop" />Stop</span>}
      <span><i className="legend-start" />Start</span><span><i className="legend-end" />End</span>
    </figcaption>
  </figure>;
}

// ---- Pickup sketch (no-show) ----------------------------------------------------

/** The element's content width in px, so an SVG can draw at 1 unit = 1 px and keep its text readable. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width) || fallback));
    observer.observe(el);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}

/** An icon from the app's set, centred on (x, y) at `size` px. */
function Glyph({ name, x, y, size }: { name: string; x: number; y: number; size: number }) {
  const s = size / 24;
  return <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${s})`} fill="none" stroke="currentColor"
    strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">{iconStrokes(name)}</g>;
}

/**
 * The driver never moved, so instead of a route: where they waited compared with the pickup point
 * and its 100 m zone (NS-1), then how long they waited, one dot per GPS reading.
 */
export function PickupSketch({ caseId, trip, points, facts }: { caseId: string; trip?: Trip; points: GpsPoint[]; facts: string[] }) {
  const play = useRouteIntro(caseId);
  const blocks = useId().replace(/:/g, "");
  const [ref, measured] = useWidth(720);
  const w = Math.max(280, Math.min(measured, 900)), h = w < 520 ? 300 : 340;
  // Narrow screens put the driver's label above the marker, so leave it a little more room.
  const layout = pickupLayout(trip, w, h, w < 520 ? 58 : 48);
  const timeline = labelledTimeline(points, [], facts);
  const marks = readingMarks(points);
  const waited = trip?.driver_wait_min ?? timeline?.totalMinutes;
  if (!layout && !timeline) return null;
  return <figure ref={ref} className={`pickup-sketch${play ? " pickup-intro" : ""}`}>
    {layout && <PickupMap layout={layout} blocks={blocks} w={w} h={h} />}
    {timeline && waited != null && <div className="pickup-wait" role="img"
      aria-label={`The driver waited ${trimDecimal(waited)} minutes, from ${timeline.start} to ${timeline.end}${marks.length ? `, with ${marks.length} GPS readings at the same spot` : ""}.`}>
      <span className="pickup-wait-label" aria-hidden="true">Waited</span>
      <div className="pickup-wait-track" aria-hidden="true">
        <span className="pickup-wait-fill" />
        {marks.map((at, index) => <i key={index} style={{ left: `${(at * 100).toFixed(2)}%`, "--dot-index": index } as CSSProperties} />)}
      </div>
      <strong className="pickup-wait-value" aria-hidden="true">{trimDecimal(waited)} min</strong>
      <span className="pickup-wait-axis" aria-hidden="true"><span>{timeline.start}</span><span>{timeline.end}</span></span>
    </div>}
    {layout && <figcaption className="route-legend pickup-legend" aria-hidden="true">
      <span><i className="legend-pickup" />Pickup point</span>
      <span><i className="legend-zone" />{PICKUP_LIMIT_M} m pickup zone</span>
      <span><i className="legend-driver" />Where the driver waited</span>
      {!layout.toScale && <span className="pickup-scale-note">Markers drawn apart; not to scale</span>}
    </figcaption>}
  </figure>;
}

function PickupMap({ layout, blocks, w: PW, h: PH }: { layout: NonNullable<ReturnType<typeof pickupLayout>>; blocks: string; w: number; h: number }) {
  const { pickup, driver, zoneRadius, distance, inside } = layout;
  const mid = { x: (pickup.x + driver.x) / 2, y: (pickup.y + driver.y) / 2 };
  const distanceLabel = distanceText(Math.round(distance));
  const pillWidth = distanceLabel.length * 9.5 + 22;
  // The zone label sits on the side of the circle away from the driver, so it never meets the line.
  const away = Math.hypot(driver.x - pickup.x, driver.y - pickup.y) || 1;
  const ux = (pickup.x - driver.x) / away, uy = (pickup.y - driver.y) / away;
  const zoneLabel = { x: pickup.x + ux * (zoneRadius + 16), y: pickup.y + uy * (zoneRadius + 16) + 5 };
  // Beside the marker when there's room (about 140 px of text), otherwise above or below it.
  const room = 30 + 140;
  const driverLabel: { x: number; y: number; anchor: "start" | "end" | "middle" } = driver.x + room <= PW ? { x: driver.x + 30, y: driver.y + 5, anchor: "start" }
    : driver.x - room >= 0 ? { x: driver.x - 30, y: driver.y + 5, anchor: "end" }
    : { x: Math.max(75, Math.min(PW - 75, driver.x)), y: driver.y > 50 ? driver.y - 34 : driver.y + 46, anchor: "middle" };
  return <svg viewBox={`0 0 ${PW} ${PH}`} preserveAspectRatio="xMidYMid meet" role="img"
    aria-label={`Sketch: the driver waited ${distanceLabel} from the pickup point, ${inside ? "inside" : "outside"} the ${PICKUP_LIMIT_M} m pickup zone.`}>
    <defs>
      <pattern id={blocks} width="76" height="58" patternUnits="userSpaceOnUse">
        <rect className="pickup-block" x="7" y="7" width="62" height="44" rx="7" />
      </pattern>
    </defs>
    <rect className="pickup-ground" x="0" y="0" width={PW} height={PH} rx="10" />
    <rect x="0" y="0" width={PW} height={PH} rx="10" fill={`url(#${blocks})`} />
    <circle className="pickup-zone" cx={pickup.x} cy={pickup.y} r={zoneRadius} />
    <text className="pickup-zone-label" x={zoneLabel.x} y={zoneLabel.y} textAnchor="middle">{PICKUP_LIMIT_M} m pickup zone</text>
    <g className={`pickup-link${inside ? " inside" : ""}`}>
      <line x1={pickup.x} y1={pickup.y} x2={driver.x} y2={driver.y} />
      <rect x={mid.x - pillWidth / 2} y={mid.y - 14} width={pillWidth} height={28} rx={14} />
      <text x={mid.x} y={mid.y + 5.5} textAnchor="middle">{distanceLabel}</text>
    </g>
    <g className="pickup-pin">
      <path d={`M${pickup.x},${pickup.y} c-4,-9 -15,-15 -15,-29 a15,15 0 1 1 30,0 c0,14 -11,20 -15,29 z`} />
      <Glyph name="person" x={pickup.x} y={pickup.y - 29} size={17} />
      <text className="pickup-point-label" x={pickup.x} y={pickup.y + 20} textAnchor="middle">Pickup point</text>
    </g>
    <g className="pickup-driver">
      <circle className="pickup-driver-halo" cx={driver.x} cy={driver.y} r={27} />
      <circle cx={driver.x} cy={driver.y} r={19} />
      <Glyph name="wheel" x={driver.x} y={driver.y} size={22} />
      <text x={driverLabel.x} y={driverLabel.y} textAnchor={driverLabel.anchor}>Driver waited here</text>
    </g>
  </svg>;
}

// ---- Timeline -------------------------------------------------------------------

export function timelineLabel(timeline: Timeline, hasPlan = true): string {
  const off = timeline.segments.filter(segment => segment.off);
  const parts = [`GPS timeline from ${timeline.start} to ${timeline.end}`];
  parts.push(hasPlan ? (off.length ? `, off the planned route for part of it` : `, on the planned route throughout`) : `; no planned route recorded`);
  for (const stop of timeline.stops) parts.push(`; a ${stop.minutes}-minute stop at ${stop.clock}`);
  for (const gap of timeline.gaps) parts.push(`; ${gap.label.toLowerCase()}`);
  return `${parts.join("")}.`;
}

/** First to last timestamp: neutral on route, amber off route, stop pins and hatched data gaps. */
export function GpsTimeline({ points, planned, facts }: { points: GpsPoint[]; planned: LatLng[]; facts: string[] }) {
  const timeline = labelledTimeline(points, planned, facts);
  if (!timeline) return null;
  const marks = [...timeline.stops.map(stop => ({ at: stop.at + Math.min(stop.width, 1 - stop.at) / 2, label: `Stopped ${stop.minutes} min · ${stop.clock}`, kind: "stop" })), ...timeline.gaps.map(gap => ({ at: gap.from, label: gap.label, kind: "gap" }))]
    .sort((a, b) => a.at - b.at);
  const rows = labelRows(marks.map(mark => mark.at), 0.28);
  const ticks = timelineTicks(timeline);
  const tickRows = labelRows(ticks.map(tick => tick.at), 0.18, 3);
  const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
  return <figure className="gps-timeline">
    <figcaption className="timeline-heading">Timeline</figcaption>
    <div className="timeline-direct-labels">{timeline.segments.map((segment, index) => <span key={index} style={{ width: pct(segment.to - segment.from) }}>
      {segment.off ? `Off route ${timelineClock(timeline, segment.from)}–${timelineClock(timeline, segment.to)}` : planned.length >= 2 ? "On route" : "GPS recorded"}
    </span>)}</div>
    <div className="timeline-track" role="img" aria-label={timelineLabel(timeline, planned.length >= 2)}>
      {timeline.segments.map((segment, index) => <span key={index} className={`timeline-segment${segment.off ? " off" : ""}`}
        style={{ left: pct(segment.from), width: pct(segment.to - segment.from) }} />)}
      {timeline.gaps.map((gap, index) => <span key={`gap-${index}`} className="timeline-gap" style={{ left: pct(gap.from), width: pct(gap.to - gap.from) }} />)}
    </div>
    {!!timeline.stops.length && <div className="timeline-stop-track" aria-hidden="true">{timeline.stops.map((stop, index) =>
      <span key={index} className="timeline-stop" style={{ left: pct(stop.at), width: pct(Math.min(stop.width, 1 - stop.at)) }} />)}</div>}
    <div className="timeline-marks" aria-hidden="true" style={{ height: `${(Math.max(-1, ...rows) + 1) * 1.6}em` }}>
      {marks.map((mark, index) => <span key={index} className={`timeline-mark ${mark.kind}${mark.at > 0.7 ? " end" : mark.at < 0.15 ? " start" : ""}`}
        style={{ left: pct(mark.at), top: `${rows[index] * 1.6}em` }}>{mark.label}</span>)}
    </div>
    <div className="timeline-ticks" aria-hidden="true" style={{ height: `${(Math.max(...tickRows) + 1) * 1.5}em` }}>{ticks.map((tick, i) =>
      <span key={tick.at} className={tick.at === 0 ? "start" : tick.at === 1 ? "end" : ""} style={{ left: pct(tick.at), top: `${tickRows[i] * 1.5}em` }}>{tick.label}</span>)}</div>
  </figure>;
}
