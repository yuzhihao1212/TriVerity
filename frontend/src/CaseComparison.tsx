import { comparison, money } from "./presentation";
import {
  fareSegments, offRoute, plateaus, polyline, progress, projector, wavyRoad,
  type GpsPoint, type LatLng, type ProgressPoint,
} from "./tripVisuals";
import type { DisputeCase } from "./types";

const W = 240, H = 104;

export function CaseComparison({ dispute }: { dispute: DisputeCase }) {
  const trip = dispute.trip;
  const route = (trip as unknown as { planned_route?: LatLng[] }).planned_route ?? [];
  const gps = (dispute.gps_points ?? []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const distance = comparison(trip.expected_distance_km, trip.actual_distance_km);
  const duration = comparison(trip.expected_duration_min, trip.actual_duration_min);
  const fare = comparison(dispute.fare.expected, dispute.fare.actual);
  if (!distance && !duration && !fare) return null;
  return <div className="comparisons">
    {distance && <Card label="Distance" percent={distance.percent} unit="km" expected={distance.expected} actual={distance.actual}>
      {gps.length >= 2 && route.length >= 2
        ? <RouteMap gps={gps} route={route} expected={distance.expected} actual={distance.actual} />
        : <RoadSketch expected={distance.expected} actual={distance.actual} />}
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

/** The real GPS track against the planned route; off-route stretches are drawn thicker. */
function RouteMap({ gps, route, expected, actual }: { gps: GpsPoint[]; route: LatLng[]; expected: number | null; actual: number | null }) {
  const project = projector([...gps, ...route], W, H, 12);
  const off = offRoute(gps, route);
  const track = gps.map(project);
  const offSegments = track.slice(1).flatMap((p, i) => off[i] || off[i + 1] ? [polyline([track[i], p])] : []);
  const start = project(gps[0]), end = project(gps[gps.length - 1]);
  const offCount = off.filter(Boolean).length;
  const label = `Map of the trip: the actual GPS track${actual != null ? ` (${actual} km)` : ""} against the planned route`
    + `${expected != null ? ` (${expected} km)` : ""}; ${offCount} of ${gps.length} GPS points are more than 150 m off the planned route.`;
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="trip-svg">
    <path d={polyline(route.map(project))} className="line-expected" />
    <path d={polyline(track)} className="line-actual" />
    {offSegments.map((d, i) => <path key={i} d={d} className="line-actual off-route" />)}
    <circle cx={start.x} cy={start.y} r="4" className="pin-start" />
    <circle cx={end.x} cy={end.y} r="4" className="pin-end" />
    <text x={start.x} y={start.y + 15} className="svg-label" textAnchor="middle">Start</text>
    <text x={end.x} y={end.y + 15} className="svg-label" textAnchor="middle">End</text>
  </svg>;
}

/** No GPS: the planned trip as the straight displacement, the actual as a longer winding road. */
function RoadSketch({ expected, actual }: { expected: number | null; actual: number | null }) {
  const ratio = expected && actual ? actual / expected : 1;
  const x0 = 18, x1 = W - 18, yExpected = 30, yActual = 76, maxAmp = 18;
  let road = wavyRoad(x0, x1, yActual, ratio, 2);
  for (let waves = 3; waves <= 14 && road.some(p => Math.abs(p.y - yActual) > maxAmp); waves++) {
    road = wavyRoad(x0, x1, yActual, ratio, waves);
  }
  const label = `Sketch: the actual route${actual != null ? `, ${actual} km,` : ""} winds ${ratio > 1 ? `${Math.round((ratio - 1) * 100)}% further than` : "no further than"} the expected${expected != null ? ` ${expected} km` : ""} between the same start and end.`;
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="trip-svg">
    <path d={`M${x0},${yExpected} L${x1},${yExpected}`} className="line-expected" />
    <path d={polyline(road)} className="line-actual" />
    {[yExpected, yActual].map(y => <g key={y}><circle cx={x0} cy={y} r="3.5" className="pin-start" /><circle cx={x1} cy={y} r="3.5" className="pin-end" /></g>)}
    <text x={x0} y={yExpected - 9} className="svg-label">Start</text>
    <text x={x1} y={yExpected - 9} className="svg-label" textAnchor="end">End</text>
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
