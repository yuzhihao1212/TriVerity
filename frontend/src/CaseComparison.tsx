import { useEffect, useId, useState, type CSSProperties } from "react";

import {
  createSeenCases, DISTANCE, DISTANCE_EXTRA_START, DISTANCE_LABEL_START, DURATION, FARE, FARE_EXTRA_START, FARE_MARKER_START,
  introVars, segmentTimings, stopDelay,
} from "./chartIntro";
import { comparison, money } from "./presentation";
import { comparisonRows, differenceLabel, distanceReadout, fareReadout, guideReadout, kmAt, kmTicks, fareSegments, niceStep, plateaus, polyline, progress, type GpsPoint, type ProgressPoint } from "./tripVisuals";
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
    {distance && <Card label="Distance" unit="km" expected={distance.expected} actual={distance.actual}>
      <DistanceToScale expected={distance.expected} actual={distance.actual} />
    </Card>}
    {duration && <Card label="Duration" unit="min" expected={duration.expected} actual={duration.actual}>
      <ProgressChart expectedMin={duration.expected} actualMin={duration.actual}
        expectedKm={distance?.expected ?? null} actualKm={distance?.actual ?? null} gps={gps} />
    </Card>}
    {fare && <Card label="Fare" unit="$" expected={fare.expected} actual={fare.actual} breakdown={dispute.fare.breakdown ?? []}>
      <FareBars expected={fare.expected} actual={fare.actual} breakdown={dispute.fare.breakdown ?? []} />
    </Card>}
  </div>;
}

function Card({ label, unit, expected, actual, breakdown = [], children }: {
  label: string; unit: string; expected: number | null; actual: number | null;
  breakdown?: { label: string; amount: number }[]; children: React.ReactNode;
}) {
  const [table, setTable] = useState(false);
  const id = useId();
  const rows = comparisonRows(expected, actual, unit, breakdown);
  return <section className="comparison" aria-labelledby={id}>
    <div className="card-head"><h3 id={id}>{label}</h3>
      <div className="chart-view-toggle" role="group" aria-label={`${label} view`}>
        <button type="button" aria-pressed={!table} onClick={() => setTable(false)}>Chart</button>
        <button type="button" aria-pressed={table} onClick={() => setTable(true)}>Table</button>
      </div>
    </div>
    <p className="comparison-difference">{differenceLabel(expected, actual, unit)}</p>
    <table hidden={!table} className="comparison-table"><caption className="sr-only">{label} comparison</caption>
      <tbody>{rows.map((row, i) => <tr key={i}><th scope="row">{row.label}</th><td>{row.value}</td></tr>)}</tbody>
    </table>
    <div hidden={table}>
      <div className="trip-visual">{children}</div>
      {rows.slice(0, 2).map(row => <div className="comparison-row" key={row.label}>
        <span><i className={`key key-${row.label.toLowerCase()}`} aria-hidden="true" />{row.label}</span><strong>{row.value}</strong>
      </div>)}
    </div>
  </section>;
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
  const [detail, setDetail] = useState(false);
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
  return <><svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={label} className="trip-svg">
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
    {longer && <rect x={x(shared)} y={(longer === "actual" ? yActual : yExpected) - 12}
      width={Math.max(1, x(longer === "actual" ? actual! : expected!) - x(shared))} height={24}
      className="chart-hit" role="button" tabIndex={0} aria-label={distanceReadout(expected!, actual!)} aria-describedby={`${id}-detail`}
      onPointerEnter={() => setDetail(true)} onPointerLeave={event => { if (event.pointerType === "mouse" && document.activeElement !== event.currentTarget) setDetail(false); }}
      onFocus={() => setDetail(true)} onBlur={() => setDetail(false)} onClick={() => setDetail(true)}
      onKeyDown={event => { if (event.key === "Escape") setDetail(false); if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDetail(true); } }} />}
  </svg><p id={`${id}-detail`} className="chart-readout">{detail && expected != null && actual != null ? distanceReadout(expected, actual) : diff === 0 ? "Route lengths match." : diff == null ? "A comparison needs both route lengths." : "Focus or tap the extra distance for details."}</p></>;
}

/** Distance covered over time: expected as a straight line, actual from GPS when available (stops are flat). */
function ProgressChart({ expectedMin, actualMin, expectedKm, actualKm, gps }: {
  expectedMin: number | null; actualMin: number | null; expectedKm: number | null; actualKm: number | null; gps: GpsPoint[];
}) {
  const id = useId().replace(/:/g, "");
  const [guide, setGuide] = useState<number | null>(null);
  const series: ProgressPoint[] | null = progress(gps);
  const left = 32, right = W - 8, top = 22, bottom = H - 20;
  const maxMin = Math.max(expectedMin ?? 0, actualMin ?? 0, series?.at(-1)?.minutes ?? 0, 1) * 1.04;
  const kmEnd = series?.at(-1)?.km ?? actualKm ?? expectedKm ?? 1;
  const yTicks = kmTicks(Math.max(expectedKm ?? 0, actualKm ?? 0, kmEnd, 0.1));
  const maxKm = yTicks.at(-1) || 1;
  const x = (m: number) => left + (m / maxMin) * (right - left);
  const y = (km: number) => bottom - (km / maxKm) * (bottom - top);
  const expectedEnd = { x: x(expectedMin ?? 0), y: y(expectedKm ?? maxKm) };
  const actual = series ?? (actualMin != null && actualKm != null ? [{ minutes: 0, km: 0 }, { minutes: actualMin, km: actualKm }] : []);
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
  const guideMax = maxMin / 1.04;
  const pointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const svgX = (event.clientX - bounds.left) / bounds.width * W;
    setGuide(Math.min(guideMax, Math.max(0, (svgX - left) / (right - left) * maxMin)));
  };
  if (!actual.length && expectedKm == null) return <p className="chart-readout">Distance data unavailable. Use the table for trip times.</p>;
  return <><svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${label} Use Left and Right arrows to explore; Escape hides the guide.`}
    aria-describedby={`${id}-readout`} tabIndex={0} className="trip-svg duration-chart"
    onFocus={() => setGuide(previous => previous ?? 0)}
    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pointer(event); }} onPointerMove={pointer}
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); setGuide(null); }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setGuide(previous => Math.max(0, Math.min(guideMax, (previous ?? 0) + (event.key === "ArrowRight" ? 1 : -1)))); }
    }}>
    <text x={left} y={10} className="svg-label">km travelled</text>
    <line x1={left} y1={top} x2={left} y2={bottom} className="axis" />
    {yTicks.map(km => <g key={km}><line x1={left - 3} y1={y(km)} x2={right} y2={y(km)} className="axis chart-grid" />
      <text x={left - 5} y={y(km) + 3} textAnchor="end" className="svg-label">{km}</text></g>)}
    <defs>
      {expectedMin != null && <Reveal id={`${id}-expected`} from={x(0)} to={expectedEnd.x} delay={DURATION.expectedStart} duration={DURATION.expectedMs} />}
      {actual.length > 1 && <Reveal id={`${id}-actual`} from={traceFrom} to={traceTo} delay={DURATION.traceStart} duration={DURATION.traceMs} linear />}
    </defs>
    <line x1={left} y1={bottom} x2={right} y2={bottom} className="axis" />
    {stops.map((s, i) => <g key={i} className="intro-fade" style={vars(stopAt(s.from), DURATION.bandMs)}>
      <rect x={x(s.from)} y={top} width={Math.max(x(s.to) - x(s.from), 2)} height={bottom - top} className="stop-band" />
      <text x={(x(s.from) + x(s.to)) / 2} y={top + 9} className="svg-label" textAnchor="middle">{Math.round(s.to - s.from)}-min stop</text>
    </g>)}
    {expectedMin != null && expectedKm != null && <path d={`M${x(0)},${y(0)} L${expectedEnd.x},${expectedEnd.y}`} className="line-expected" clipPath={`url(#${id}-expected)`} />}
    {actual.length > 1 && <path d={polyline(actual.map(p => ({ x: x(p.minutes), y: y(p.km) })))} className="line-actual" clipPath={`url(#${id}-actual)`} />}
    <text x={x(0)} y={H - 6} className="svg-label">0</text>
    {ticks(expectedMin, actualMin, x).map(t =>
      <text key={t.text} x={t.x} y={H - 6} className="svg-label intro-fade" textAnchor={t.anchor} style={tickAt(t)}>{t.text}</text>)}
    {guide != null && <g className="chart-guide" pointerEvents="none">
      <line x1={x(guide)} x2={x(guide)} y1={top} y2={bottom} />
      {kmAt(actual, guide) != null && <circle cx={x(guide)} cy={y(kmAt(actual, guide)!)} r={3} />}
    </g>}
  </svg><p className="chart-key">Flat line = car not moving</p>
    <p id={`${id}-readout`} className="chart-readout" aria-live="polite">{guide == null ? "Point, tap or use ← / → for details." : guideReadout(actual, guide, expectedMin, expectedKm)}</p></>;
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
  const [detail, setDetail] = useState<number | null>(null);
  const readoutId = useId();
  const max = Math.max(expected ?? 0, actual ?? 0, 0.01);
  const pct = (v: number) => `${(v / max) * 100}%`;
  const segments = actual != null ? fareSegments(breakdown, actual) : [];
  const extra = expected != null && actual != null ? actual - expected : null;
  const label = `Fare: expected ${expected != null ? money(expected) : "not provided"}, charged ${actual != null ? money(actual) : "not provided"}`
    + `${extra != null && extra > 0 ? `, ${money(extra)} above expected` : ""}`
    + `${segments.length > 1 ? `; charged fare made up of ${segments.map(s => `${s.label} ${money(s.amount)}`).join(", ")}` : ""}.`;
  // The charged segments fill one after another at one speed, so the track reads left to right.
  const timings = segmentTimings(segments.map(s => s.amount), FARE.chargedStart, FARE.chargedMs);
  return <div className="fare-bars" role="group" aria-label={label}>
    <div className="fare-track"><div className="fare-expected intro-grow" style={{ width: pct(expected ?? 0), ...vars(FARE.expectedStart, FARE.expectedMs) }} /></div>
    <div className="fare-track">
      {segments.map((s, i) => <button type="button" key={i} className="fare-segment intro-grow linear" aria-label={fareReadout(s)} aria-describedby={readoutId}
        onPointerEnter={() => setDetail(i)} onPointerLeave={event => { if (event.pointerType === "mouse" && document.activeElement !== event.currentTarget) setDetail(null); }}
        onFocus={() => setDetail(i)} onBlur={() => setDetail(null)} onClick={() => setDetail(i)}
        onKeyDown={event => { if (event.key === "Escape") setDetail(null); }}
        style={{ width: pct(s.amount), background: `color-mix(in srgb, var(--accent) ${100 - (i % 4) * 20}%, var(--surface))`, ...vars(timings[i].delay, timings[i].duration) }} />)}
      {expected != null && extra != null && extra > 0 && <div className="fare-marker intro-fade" style={{ left: pct(expected), ...vars(FARE_MARKER_START, FARE.markerMs) }} />}
    </div>
    {extra != null && extra > 0 && <p className="fare-extra intro-rise" style={vars(FARE_EXTRA_START, FARE.extraMs)}>+{money(extra)} above expected</p>}
    <p id={readoutId} className="chart-readout">{detail != null ? fareReadout(segments[detail]) : segments.length ? "Focus or tap a fare segment for details." : "Charged fare not provided."}</p>
    {segments.length > 1 && <p className="fare-legend">{segments.map(s => `${s.label} ${money(s.amount)}`).join(" · ")}</p>}
  </div>;
}
