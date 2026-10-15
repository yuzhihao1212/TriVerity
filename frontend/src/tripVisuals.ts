// Geometry for the trip visuals in "Case at a glance". Pure functions, so they're testable;
// every shape is computed from the dispute's own data, never invented.

export interface LatLng { lat: number; lng: number }
export interface GpsPoint extends LatLng { timestamp?: string | null }
export interface Pt { x: number; y: number }

/** A round ruler step (1, 2, 5, 10…) giving about four ticks up to `max`. */
export function niceStep(max: number): number {
  const raw = max / 4, power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map(m => m * power).find(step => step >= raw) ?? 10 * power;
}

const EARTH_M = 6_371_000;

export function metres(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function polyline(points: Pt[]): string {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

export interface ProgressPoint { minutes: number; km: number }

/** Cumulative distance covered over time from timestamped GPS points (null if unusable). */
export function progress(points: GpsPoint[]): ProgressPoint[] | null {
  const timed = points
    .map(p => ({ ...p, ms: p.timestamp ? Date.parse(p.timestamp) : NaN }))
    .filter(p => Number.isFinite(p.ms) && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .sort((a, b) => a.ms - b.ms);
  if (timed.length < 2) return null;
  let km = 0;
  return timed.map((p, i) => {
    if (i) km += metres(timed[i - 1], p) / 1000;
    return { minutes: (p.ms - timed[0].ms) / 60_000, km };
  });
}

/** Stretches where the vehicle didn't move for at least `minMinutes` (the plateaus on the chart). */
export function plateaus(series: ProgressPoint[], minMinutes = 3, epsilonKm = 0.05): { from: number; to: number }[] {
  const found: { from: number; to: number }[] = [];
  let start = 0;
  for (let i = 1; i <= series.length; i++) {
    const moved = i === series.length || series[i].km - series[start].km > epsilonKm;
    if (moved) {
      const end = series[i - 1];
      if (end.minutes - series[start].minutes >= minMinutes) found.push({ from: series[start].minutes, to: end.minutes });
      start = i;
    }
  }
  return found;
}

export interface FareSegment { label: string; amount: number }

/** The charged fare split into its itemised lines (scaled to the charge), or one segment. */
export function fareSegments(breakdown: FareSegment[], charged: number): FareSegment[] {
  const positive = breakdown.filter(line => line.amount > 0);
  const total = positive.reduce((s, line) => s + line.amount, 0);
  if (!positive.length || total <= 0) return [{ label: "Charged fare", amount: charged }];
  return positive.map(line => ({ label: line.label, amount: (line.amount / total) * charged }));
}
