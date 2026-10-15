import { comparison, money } from "./presentation";
import { fareSegments, niceStep, plateaus, polyline, progress, type GpsPoint, type ProgressPoint } from "./tripVisuals";
import type { DisputeCase } from "./types";

const W = 240, H = 104;

export function CaseComparison({ dispute }: { dispute: DisputeCase }) {
  const trip = dispute.trip;
  const gps = (dispute.gps_points ?? []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const distance = comparison(trip.expected_distance_km, trip.actual_distance_km);
  const duration = comparison(trip.expected_duration_min, trip.actual_duration_min);
  const fare = comparison(dispute.fare.expected, dispute.fare.actual);
  if (!distance && !duration && !fare) return null;
  return <div className="comparisons">
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

/** Both routes unrolled into straight lines drawn to scale, with the difference highlighted. */
function DistanceToScale({ expected, actual }: { expected: number | null; actual: number | null }) {
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
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="trip-svg">
    {expected != null && <>
      <path d={`M${x(0)},${yExpected} L${x(longer === "expected" ? shared : expected)},${yExpected}`} className="line-expected" />
      {longer === "expected" && <path d={`M${x(shared)},${yExpected} L${x(expected)},${yExpected}`} className="line-expected extra" />}
      <circle cx={x(0)} cy={yExpected} r="3.5" className="pin-start" /><circle cx={x(expected)} cy={yExpected} r="3.5" className="pin-end" />
    </>}
    {actual != null && <>
      <path d={`M${x(0)},${yActual} L${x(longer === "actual" ? shared : actual)},${yActual}`} className="line-actual" />
      {longer === "actual" && <path d={`M${x(shared)},${yActual} L${x(actual)},${yActual}`} className="line-actual extra" />}
      <circle cx={x(0)} cy={yActual} r="3.5" className="pin-start" /><circle cx={x(actual)} cy={yActual} r="3.5" className="pin-end" />
    </>}
    {longer && <text x={(x(shared) + x(longer === "actual" ? actual! : expected!)) / 2} y={(longer === "actual" ? yActual : yExpected) - 9}
      className="svg-label extra-label" textAnchor="middle">{diffText}</text>}
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
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="trip-svg">
    <line x1={left} y1={bottom} x2={right} y2={bottom} className="axis" />
    {stops.map((s, i) => <g key={i}>
      <rect x={x(s.from)} y={top} width={Math.max(x(s.to) - x(s.from), 2)} height={bottom - top} className="stop-band" />
      <text x={(x(s.from) + x(s.to)) / 2} y={top + 9} className="svg-label" textAnchor="middle">{Math.round(s.to - s.from)}-min stop</text>
    </g>)}
    {expectedMin != null && <path d={`M${x(0)},${y(0)} L${expectedEnd.x},${expectedEnd.y}`} className="line-expected" />}
    {actual.length > 1 && <path d={polyline(actual.map(p => ({ x: x(p.minutes), y: y(p.km) })))} className="line-actual" />}
    <text x={x(0)} y={H - 6} className="svg-label">0</text>
    {ticks(expectedMin, actualMin, x).map(t =>
      <text key={t.text} x={t.x} y={H - 6} className="svg-label" textAnchor={t.anchor}>{t.text}</text>)}
  </svg>;
}

/** End-time labels for the chart; close times share one label so they never overlap. */
function ticks(expectedMin: number | null, actualMin: number | null, x: (m: number) => number) {
  const times = [expectedMin, actualMin].filter((m): m is number => m != null);
  const anchor = (px: number): "middle" | "end" => px > W - 30 ? "end" : "middle";
  if (times.length === 2 && Math.abs(x(times[0]) - x(times[1])) < 52) {
    const at = x(Math.max(...times));
    return [{ x: at, anchor: "end" as const, text: `${expectedMin} → ${actualMin} min` }];
  }
  return times.map(m => ({ x: x(m), anchor: anchor(x(m)), text: `${m} min` }));
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
  return <div className="fare-bars" role="img" aria-label={label}>
    <div className="fare-track"><div className="fare-expected" style={{ width: pct(expected ?? 0) }} /></div>
    <div className="fare-track">
      {segments.map((s, i) => <div key={i} className="fare-segment" title={`${s.label}: ${money(s.amount)}`}
        style={{ width: pct(s.amount), opacity: 1 - (i % 4) * 0.2 }} />)}
      {expected != null && extra != null && extra > 0 && <div className="fare-marker" style={{ left: pct(expected) }} />}
    </div>
    {extra != null && extra > 0 && <p className="fare-extra">+{money(extra)} above expected</p>}
    {segments.length > 1 && <p className="fare-legend">{segments.map(s => `${s.label} ${money(s.amount)}`).join(" · ")}</p>}
  </div>;
}
