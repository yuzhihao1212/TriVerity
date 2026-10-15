import { useEffect, useId, useState, type CSSProperties } from "react";

import {
  createSeenCases, DISTANCE, DISTANCE_EXTRA_START, DISTANCE_LABEL_START, DURATION, FARE, FARE_EXTRA_START, FARE_MARKER_START,
  introVars, segmentTimings, stopDelay,
} from "./chartIntro";
import { comparison, money } from "./presentation";
import { fareSegments, niceStep, plateaus, polyline, progress, type GpsPoint, type ProgressPoint } from "./tripVisuals";
import type { DisputeCase } from "./types";

const W = 240, H = 104;

// One per page load, shared by every CaseComparison: a case plays its intro once per session.
let seenCases: ReturnType<typeof createSeenCases> | null = null;
function seen() {
  if (!seenCases) {
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* Blocked storage: memory only. */ }
    seenCases = createSeenCases(storage);
  }
  return seenCases;
}
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const vars = (delay: number, duration: number) => introVars(delay, duration) as CSSProperties;

export function CaseComparison({ dispute }: { dispute: DisputeCase }) {
  // A new case remounts the charts, so each case decides afresh whether to play.
  return <Charts key={dispute.dispute_id} dispute={dispute} />;
}

function Charts({ dispute }: { dispute: DisputeCase }) {
  // Decided once per mount, without side effects (StrictMode may call this twice).
  // Re-renders (theme, presentation mode) keep the decision; a remount (tab switch,
  // re-selecting the case) finds the case already seen.
  const [intro] = useState(() => !reducedMotion() && !seen().has(dispute.dispute_id));
  useEffect(() => { if (intro) seen().mark(dispute.dispute_id); }, [intro, dispute.dispute_id]);

  const trip = dispute.trip;
  const gps = (dispute.gps_points ?? []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const distance = comparison(trip.expected_distance_km, trip.actual_distance_km);
  const duration = comparison(trip.expected_duration_min, trip.actual_duration_min);
  const fare = comparison(dispute.fare.expected, dispute.fare.actual);
  if (!distance && !duration && !fare) return null;
  // The hidden starting states exist only under this class, so without it everything is final.
  return <div className={`comparisons${intro ? " chart-intro" : ""}`}>
    {distance && <Card label="Distance" percent={distance.percent} unit="km" expected={distance.expected} actual={distance.actual}>
      <DistanceToScale expected={distance.expected} actual={distance.actual} />
    </Card>}
    {duration && <Card label="Duration" percent={duration.percent} unit="min" expected={duration.expected} actual={duration.actual}>
      <ProgressChart expectedMin={duration.expected} actualMin={duration.actual}
        expectedKm={distance?.expected ?? null} actualKm={distance?.actual ?? null} gps={gps} />
    </Card>}
    {fare && <Card label="Fare" percent={fare.percent} unit="$" expected={fare.expected} actual={fare.actual}>
      <FareBars expected={fare.expected} actual={fare.actual} breakdown={dispute.fare.breakdown ?? []} />
    </Card>}
  </div>;
}

function Card({ label, percent, unit, expected, actual, children }: {
  label: string; percent: number | null; unit: string; expected: number | null; actual: number | null; children: React.ReactNode;
}) {
  const format = (value: number | null) => value == null ? "Not provided" : unit === "$" ? money(value) : `${value} ${unit}`;
  return <div className="comparison">
    <div className="card-head"><strong>{label}</strong>
      {percent !== null && <span className="delta">{percent > 0 ? "+" : ""}{Math.round(percent)}%</span>}
    </div>
    <div className="trip-visual">{children}</div>
    <div className="comparison-row"><span><i className="key key-expected" aria-hidden="true" />Expected</span><strong>{format(expected)}</strong></div>
    <div className="comparison-row"><span><i className="key key-actual" aria-hidden="true" />Actual</span><strong>{format(actual)}</strong></div>
  </div>;
}

/**
 * A rectangle that clips one line, revealed left to right by the intro. At rest it
 * covers the line fully, so the line shows whole without the intro class. Clipping
 * (not dash offsets) keeps the expected lines' own dashes intact.
 */
function Reveal({ id, from, to, delay, duration, linear = false }: {
  id: string; from: number; to: number; delay: number; duration: number; linear?: boolean;
}) {
  const pad = 4; // room for round caps and pins
  return <clipPath id={id}>
    <rect x={from - pad} y={0} width={Math.max(0, to - from) + 2 * pad} height={H}
      className={`intro-reveal${linear ? " linear" : ""}`} style={vars(delay, duration)} />
  </clipPath>;
}

/** Both routes unrolled into straight lines drawn to scale, with the difference highlighted. */
function DistanceToScale({ expected, actual }: { expected: number | null; actual: number | null }) {
  const id = useId().replace(/:/g, "");
  const left = 10, right = W - 10, yExpected = 26, yActual = 54, yRuler = 82;
  const maxKm = Math.max(expected ?? 0, actual ?? 0, 0.1);
  const x = (km: number) => left + (km / maxKm) * (right - left);
  const step = niceStep(maxKm);
  const ticks = Array.from({ length: Math.floor(maxKm / step) + 1 }, (_, i) => i * step);
  const shared = Math.min(expected ?? 0, actual ?? 0);
  const diff = expected != null && actual != null ? actual - expected : null;
  const longer = diff != null && diff > 0 ? "actual" : diff != null && diff < 0 ? "expected" : null;
  const diffText = diff != null ? `${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} km` : "";
  const label = `Route lengths drawn to scale: expected ${expected ?? "not provided"} km, actual ${actual ?? "not provided"} km`
    + `${diff ? `; the actual route was ${Math.abs(diff).toFixed(1)} km ${diff > 0 ? "longer" : "shorter"}` : ""}.`;
  // Both lines' shared part draws over the same time, so they move at the same speed;
  // the longer line's extra segment continues after it.
  const lineEnd = DISTANCE.lineStart + DISTANCE.lineMs;
  const extraEnd = DISTANCE_EXTRA_START + DISTANCE.extraMs;
  const pinAt = (line: "expected" | "actual") => vars(longer === line ? extraEnd : lineEnd, DISTANCE.pinMs);
  const reveal = (name: string) => `url(#${id}-${name})`;
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="trip-svg">
    <defs>
      {expected != null && <Reveal id={`${id}-expected`} from={x(0)} to={x(longer === "expected" ? shared : expected)} delay={DISTANCE.lineStart} duration={DISTANCE.lineMs} />}
      {actual != null && <Reveal id={`${id}-actual`} from={x(0)} to={x(longer === "actual" ? shared : actual)} delay={DISTANCE.lineStart} duration={DISTANCE.lineMs} />}
      {longer && <Reveal id={`${id}-extra`} from={x(shared)} to={x(longer === "actual" ? actual! : expected!)} delay={DISTANCE_EXTRA_START} duration={DISTANCE.extraMs} />}
    </defs>
    {expected != null && <>
      <path d={`M${x(0)},${yExpected} L${x(longer === "expected" ? shared : expected)},${yExpected}`} className="line-expected" clipPath={reveal("expected")} />
      {longer === "expected" && <path d={`M${x(shared)},${yExpected} L${x(expected)},${yExpected}`} className="line-expected extra" clipPath={reveal("extra")} />}
      <circle cx={x(0)} cy={yExpected} r="3.5" className="pin-start" /><circle cx={x(expected)} cy={yExpected} r="3.5" className="pin-end intro-pop" style={pinAt("expected")} />
    </>}
    {actual != null && <>
      <path d={`M${x(0)},${yActual} L${x(longer === "actual" ? shared : actual)},${yActual}`} className="line-actual" clipPath={reveal("actual")} />
      {longer === "actual" && <path d={`M${x(shared)},${yActual} L${x(actual)},${yActual}`} className="line-actual extra" clipPath={reveal("extra")} />}
      <circle cx={x(0)} cy={yActual} r="3.5" className="pin-start" /><circle cx={x(actual)} cy={yActual} r="3.5" className="pin-end intro-pop" style={pinAt("actual")} />
    </>}
    {longer && <text x={(x(shared) + x(longer === "actual" ? actual! : expected!)) / 2} y={(longer === "actual" ? yActual : yExpected) - 9}
      className="svg-label extra-label intro-rise" textAnchor="middle" style={vars(DISTANCE_LABEL_START, DISTANCE.labelMs)}>{diffText}</text>}
    <line x1={left} y1={yRuler} x2={right} y2={yRuler} className="axis" />
    {ticks.map(km => <g key={km}>
      <line x1={x(km)} y1={yRuler - 3} x2={x(km)} y2={yRuler + 3} className="axis" />
      <text x={x(km)} y={yRuler + 14} className="svg-label" textAnchor={km === 0 ? "start" : "middle"}>{km === ticks[ticks.length - 1] ? `${km} km` : km}</text>
    </g>)}
  </svg>;
}

/** Distance covered over time: expected as a straight line, actual from GPS when available (stops are flat). */
function ProgressChart({ expectedMin, actualMin, expectedKm, actualKm, gps }: {
  expectedMin: number | null; actualMin: number | null; expectedKm: number | null; actualKm: number | null; gps: GpsPoint[];
}) {
  const id = useId().replace(/:/g, "");
  const series: ProgressPoint[] | null = progress(gps);
  const left = 8, right = W - 8, top = 10, bottom = H - 20;
  const maxMin = Math.max(expectedMin ?? 0, actualMin ?? 0, series?.at(-1)?.minutes ?? 0, 1) * 1.04;
  const kmEnd = series?.at(-1)?.km ?? actualKm ?? expectedKm ?? 1;
  const maxKm = Math.max(expectedKm ?? 0, actualKm ?? 0, kmEnd, 0.1);
  const x = (m: number) => left + (m / maxMin) * (right - left);
  const y = (km: number) => bottom - (km / maxKm) * (bottom - top);
  // Without distances, show time alone: both lines reach the same height.
  const expectedEnd = { x: x(expectedMin ?? 0), y: y(expectedKm ?? maxKm) };
  const actual = series ?? (actualMin != null ? [{ minutes: 0, km: 0 }, { minutes: actualMin, km: actualKm ?? maxKm }] : []);
  const stops = series ? plateaus(series) : [];
  const stopText = stops.map(s => `${Math.round(s.to - s.from)}-minute stop`).join(", ");
  const label = `Progress over time: expected${expectedKm != null ? ` ${expectedKm} km` : ""} in ${expectedMin ?? "?"} min; actual`
    + `${actualKm != null ? ` ${actualKm} km` : ""} in ${actualMin ?? "?"} min${stopText ? `, including a ${stopText}` : ""}.`;
  // x is minutes, so revealing the actual line left to right (linearly) replays the trip in time order.
  const traceFrom = x(0), traceTo = actual.length ? Math.max(...actual.map(p => x(p.minutes))) : traceFrom;
  const expectedDone = DURATION.expectedStart + DURATION.expectedMs;
  const traceDone = DURATION.traceStart + DURATION.traceMs;
  const stopAt = (from: number) => stopDelay(x(from), traceFrom, traceTo, DURATION.traceMs, DURATION.traceStart);
  const tickAt = (t: { minutes: number[] }) => {
    const ends = t.minutes.map(m => m === expectedMin ? expectedDone : traceDone);
    return vars(Math.max(...ends), DURATION.labelMs);
  };
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="trip-svg">
    <defs>
      {expectedMin != null && <Reveal id={`${id}-expected`} from={x(0)} to={expectedEnd.x} delay={DURATION.expectedStart} duration={DURATION.expectedMs} />}
      {actual.length > 1 && <Reveal id={`${id}-actual`} from={traceFrom} to={traceTo} delay={DURATION.traceStart} duration={DURATION.traceMs} linear />}
    </defs>
    <line x1={left} y1={bottom} x2={right} y2={bottom} className="axis" />
    {stops.map((s, i) => <g key={i} className="intro-fade" style={vars(stopAt(s.from), DURATION.bandMs)}>
      <rect x={x(s.from)} y={top} width={Math.max(x(s.to) - x(s.from), 2)} height={bottom - top} className="stop-band" />
      <text x={(x(s.from) + x(s.to)) / 2} y={top + 9} className="svg-label" textAnchor="middle">{Math.round(s.to - s.from)}-min stop</text>
    </g>)}
    {expectedMin != null && <path d={`M${x(0)},${y(0)} L${expectedEnd.x},${expectedEnd.y}`} className="line-expected" clipPath={`url(#${id}-expected)`} />}
    {actual.length > 1 && <path d={polyline(actual.map(p => ({ x: x(p.minutes), y: y(p.km) })))} className="line-actual" clipPath={`url(#${id}-actual)`} />}
    <text x={x(0)} y={H - 6} className="svg-label">0</text>
    {ticks(expectedMin, actualMin, x).map(t =>
      <text key={t.text} x={t.x} y={H - 6} className="svg-label intro-fade" textAnchor={t.anchor} style={tickAt(t)}>{t.text}</text>)}
  </svg>;
}

/** End-time labels for the chart; close times share one label so they never overlap. */
function ticks(expectedMin: number | null, actualMin: number | null, x: (m: number) => number) {
  const times = [expectedMin, actualMin].filter((m): m is number => m != null);
  const anchor = (px: number): "middle" | "end" => px > W - 30 ? "end" : "middle";
  if (times.length === 2 && Math.abs(x(times[0]) - x(times[1])) < 52) {
    const at = x(Math.max(...times));
    return [{ x: at, anchor: "end" as const, text: `${expectedMin} → ${actualMin} min`, minutes: times }];
  }
  return times.map(m => ({ x: x(m), anchor: anchor(x(m)), text: `${m} min`, minutes: [m] }));
}

/** Two slim bars: expected vs charged, the charge split into its itemised lines; the extra is marked. */
function FareBars({ expected, actual, breakdown }: { expected: number | null; actual: number | null; breakdown: { label: string; amount: number }[] }) {
  const max = Math.max(expected ?? 0, actual ?? 0, 0.01);
  const pct = (v: number) => `${(v / max) * 100}%`;
  const segments = actual != null ? fareSegments(breakdown, actual) : [];
  const extra = expected != null && actual != null ? actual - expected : null;
  const label = `Fare: expected ${expected != null ? money(expected) : "not provided"}, charged ${actual != null ? money(actual) : "not provided"}`
    + `${extra != null && extra > 0 ? `, ${money(extra)} above expected` : ""}`
    + `${segments.length > 1 ? `; charged fare made up of ${segments.map(s => `${s.label} ${money(s.amount)}`).join(", ")}` : ""}.`;
  // The charged segments fill one after another at one speed, so the track reads left to right.
  const timings = segmentTimings(segments.map(s => s.amount), FARE.chargedStart, FARE.chargedMs);
  return <div className="fare-bars" role="img" aria-label={label}>
    <div className="fare-track"><div className="fare-expected intro-grow" style={{ width: pct(expected ?? 0), ...vars(FARE.expectedStart, FARE.expectedMs) }} /></div>
    <div className="fare-track">
      {segments.map((s, i) => <div key={i} className="fare-segment intro-grow linear" title={`${s.label}: ${money(s.amount)}`}
        style={{ width: pct(s.amount), opacity: 1 - (i % 4) * 0.2, ...vars(timings[i].delay, timings[i].duration) }} />)}
      {expected != null && extra != null && extra > 0 && <div className="fare-marker intro-fade" style={{ left: pct(expected), ...vars(FARE_MARKER_START, FARE.markerMs) }} />}
    </div>
    {extra != null && extra > 0 && <p className="fare-extra intro-rise" style={vars(FARE_EXTRA_START, FARE.extraMs)}>+{money(extra)} above expected</p>}
    {segments.length > 1 && <p className="fare-legend">{segments.map(s => `${s.label} ${money(s.amount)}`).join(" · ")}</p>}
  </div>;
}
