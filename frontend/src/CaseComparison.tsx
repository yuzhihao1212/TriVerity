import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

import {
  createSeenCases, DISTANCE, DISTANCE_EXTRA_START, DISTANCE_LABEL_START, DURATION, FARE, FARE_EXTRA_START, FARE_MARKER_START,
  introVars,
} from "./chartIntro";
import { comparison, money } from "./presentation";
import { dialCentre, dialMinutes, fareChange } from "./tripDial";
import { comparisonRows, differenceLabel, distanceReadout, niceStep, plateaus, progress, type GpsPoint } from "./tripVisuals";
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
    {/* The dial's centre and the meter's badge carry the difference, so those cards skip the line above them. */}
    {duration && <Card label="Duration" unit="min" expected={duration.expected} actual={duration.actual} showDifference={false}>
      <DurationDial expectedMin={duration.expected} actualMin={duration.actual} gps={gps} />
    </Card>}
    {fare && <Card label="Fare" unit="$" expected={fare.expected} actual={fare.actual} breakdown={dispute.fare.breakdown ?? []} showDifference={false} showRows={false}>
      <FareMeter expected={fare.expected} actual={fare.actual} intro={intro} />
    </Card>}
  </div>;
}

function Card({ label, unit, expected, actual, breakdown = [], showDifference = true, showRows = true, children }: {
  label: string; unit: string; expected: number | null; actual: number | null;
  breakdown?: { label: string; amount: number }[]; showDifference?: boolean; showRows?: boolean; children: React.ReactNode;
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
    {(showDifference || table) && <p className="comparison-difference">{differenceLabel(expected, actual, unit)}</p>}
    <table hidden={!table} className="comparison-table"><caption className="sr-only">{label} comparison</caption>
      <tbody>{rows.map((row, i) => <tr key={i}><th scope="row">{row.label}</th><td>{row.value}</td></tr>)}</tbody>
    </table>
    <div hidden={table}>
      <div className="trip-visual">{children}</div>
      {showRows && rows.slice(0, 2).map(row => <div className="comparison-row" key={row.label}>
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

/**
 * Duration as a clock face: the expected trip on the inner ring (dashed, like its key), the actual
 * trip on the outer ring, stops from GPS marked on it, and the difference in the middle.
 */
function DurationDial({ expectedMin, actualMin, gps }: { expectedMin: number | null; actualMin: number | null; gps: GpsPoint[] }) {
  const id = useId().replace(/:/g, "");
  const full = dialMinutes(Math.max(expectedMin ?? 0, actualMin ?? 0));
  const series = progress(gps);
  const stops = series ? plateaus(series) : [];
  const centre = dialCentre(expectedMin, actualMin);
  const stopText = stops.map(s => `${Math.round(s.to - s.from)}-minute stop`).join(", ");
  const label = `Trip time on a ${full}-minute dial: expected ${expectedMin ?? "not provided"} min, actual ${actualMin ?? "not provided"} min`
    + `${stopText ? `, including a ${stopText}` : ""}.`;
  const c = 60, outer = 50, inner = 36;
  // A ring revealed clockwise from 12 o'clock: the mask's dash sweeps from 0 to `minutes`.
  const sweep = (name: string, r: number, width: number, minutes: number, delay: number, duration: number) =>
    <mask id={`${id}-${name}`} maskUnits="userSpaceOnUse" x={0} y={0} width={120} height={120}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#fff" strokeWidth={width + 2} pathLength={full}
        strokeDasharray={`${minutes} ${full}`} className="dial-sweep" style={{ "--sweep": minutes, ...vars(delay, duration) } as CSSProperties} />
    </mask>;
  // The trace and its stops share one clockwise sweep, so a stop appears as the sweep reaches it.
  const stopAt = (from: number) => Math.round(DURATION.traceStart + (actualMin ? Math.min(1, from / actualMin) : 0) * DURATION.traceMs);
  return <div className="duration-dial">
    <svg viewBox="0 0 120 120" role="img" aria-label={label} className="trip-svg dial-svg">
      <g transform={`rotate(-90 ${c} ${c})`}>
        <defs>
          {expectedMin != null && sweep("expected", inner, 7, expectedMin, DURATION.expectedStart, DURATION.expectedMs)}
          {actualMin != null && sweep("actual", outer, 9, actualMin, DURATION.traceStart, DURATION.traceMs)}
        </defs>
        <circle cx={c} cy={c} r={outer} className="dial-track" strokeWidth={9} />
        <circle cx={c} cy={c} r={inner} className="dial-track" strokeWidth={7} />
        {Array.from({ length: full / 15 }, (_, i) => {
          const angle = (i * 15 / full) * 2 * Math.PI;
          return <line key={i} x1={c + Math.cos(angle) * 57} y1={c + Math.sin(angle) * 57} x2={c + Math.cos(angle) * 60} y2={c + Math.sin(angle) * 60} className="axis" />;
        })}
        {expectedMin != null && <circle cx={c} cy={c} r={inner} className="dial-expected" mask={`url(#${id}-expected)`} />}
        {actualMin != null && <circle cx={c} cy={c} r={outer} className="dial-actual" mask={`url(#${id}-actual)`} />}
        {stops.map((s, i) => <circle key={i} cx={c} cy={c} r={outer} className="dial-stop intro-fade" pathLength={full}
          strokeDasharray={`${Math.max(.4, s.to - s.from)} ${full}`} strokeDashoffset={-s.from} style={vars(stopAt(s.from), DURATION.bandMs)} />)}
      </g>
      {centre && <g className="intro-fade" style={vars(DURATION.traceStart + DURATION.traceMs, DURATION.labelMs)}>
        <text x={c} y={c + 3} textAnchor="middle" className="dial-value">{centre.value}</text>
        <text x={c} y={c + 16} textAnchor="middle" className="svg-label">{centre.caption}</text>
      </g>}
    </svg>
    <ul className="dial-key">
      {stops.map((s, i) => <li key={i}><i className="dial-key-stop" aria-hidden="true" />{Math.round(s.to - s.from)}-min stop</li>)}
      <li>Inner ring: expected · outer ring: actual</li>
      <li>Full circle = {full} min</li>
    </ul>
  </div>;
}

/**
 * Fare as a taxi meter: the expected fare struck through, the charged fare (ticking up from the
 * expected one during the intro), a badge for the change, and a track showing the overrun.
 */
function FareMeter({ expected, actual, intro }: { expected: number | null; actual: number | null; intro: boolean }) {
  const change = fareChange(expected, actual);
  const ticking = intro && expected != null && actual != null && change?.direction !== "same";
  const [shown, setShown] = useState(ticking ? expected! : actual);
  const frame = useRef(0);
  useEffect(() => {
    if (!ticking) return;
    const startedAt = performance.now() + FARE.chargedStart;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - startedAt) / FARE.chargedMs));
      setShown(expected! + (actual! - expected!) * (1 - (1 - t) ** 3));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [ticking, expected, actual]);
  if (actual == null) return <p className="chart-readout">Charged fare not provided.</p>;
  const max = Math.max(expected ?? 0, actual, 0.01);
  const pct = (v: number) => `${(v / max) * 100}%`;
  const label = `Fare: charged ${money(actual)}${expected != null ? `, expected ${money(expected)}` : ""}${change && change.direction !== "same" ? `, ${change.text.replace(" · ", ", ")}` : ""}.`;
  return <div className="fare-meter" role="group" aria-label={label}>
    <div aria-hidden="true">
      {expected != null && change?.direction !== "same" && <p className="fare-was">Expected <s>{money(expected)}</s></p>}
      <div className="fare-meter-row">
        <span className={`fare-meter-value ${change?.direction ?? ""}`}>{money(shown ?? actual)}</span>
        {change && <span className={`fare-change ${change.direction} intro-rise`} style={vars(FARE_EXTRA_START, FARE.extraMs)}>
          {change.direction !== "same" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {change.direction === "up" ? <path d="M3 17l6-6 4 4 8-8M15 7h6v6" /> : <path d="M3 7l6 6 4-4 8 8M15 17h6v-6" />}
          </svg>}
          {change.text}
        </span>}
      </div>
      <div className="fare-meter-track">
        <span className="fare-meter-base intro-grow" style={{ width: pct(Math.min(expected ?? actual, actual)), ...vars(FARE.expectedStart, FARE.expectedMs) }} />
        {change?.direction === "up" && <span className="fare-meter-over intro-grow" style={{ left: pct(expected!), width: pct(actual - expected!), ...vars(FARE.chargedStart, FARE.chargedMs) }} />}
        {expected != null && change?.direction !== "same" && <span className="fare-meter-tick intro-fade" style={{ left: pct(expected), ...vars(FARE_MARKER_START, FARE.markerMs) }}><span>expected</span></span>}
      </div>
    </div>
  </div>;
}
