// Geometry for the trip visuals in "Case at a glance". Pure functions, so they're testable;
// every shape is computed from the dispute's own data, never invented.

export interface LatLng { lat: number; lng: number }
export interface GpsPoint extends LatLng { timestamp?: string | null }
export interface Pt { x: number; y: number }

const EARTH_M = 6_371_000;
export const OFF_ROUTE_M = 150;   // same threshold as the backend's planned-route comparison

export function metres(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Fit lat/lng points into a box, keeping the map's proportions (north up). */
export function projector(points: LatLng[], width: number, height: number, pad = 10): (p: LatLng) => Pt {
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map(p => p.lng * k), ys = points.map(p => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min((width - 2 * pad) / Math.max(maxX - minX, 1e-9), (height - 2 * pad) / Math.max(maxY - minY, 1e-9));
  const offX = (width - (maxX - minX) * scale) / 2, offY = (height - (maxY - minY) * scale) / 2;
  return p => ({ x: offX + (p.lng * k - minX) * scale, y: offY + (maxY - p.lat) * scale });
}

/** Distance in metres from a point to the nearest segment of a route (flat projection; fine at city scale). */
export function offsetFromRoute(p: LatLng, route: LatLng[]): number {
  const mLat = 110_540, mLng = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const ax = (route[i - 1].lng - p.lng) * mLng, ay = (route[i - 1].lat - p.lat) * mLat;
    const bx = (route[i].lng - p.lng) * mLng, by = (route[i].lat - p.lat) * mLat;
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

export function offRoute(points: LatLng[], route: LatLng[], threshold = OFF_ROUTE_M): boolean[] {
  return points.map(p => offsetFromRoute(p, route) > threshold);
}

export function polyline(points: Pt[]): string {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

function length(points: Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

/**
 * A stylised road from (x0, y) to (x1, y) whose drawn length is `ratio` times the straight line,
 * e.g. 1.44 for a route 44% longer than expected. Found by solving for the wave's height.
 */
export function wavyRoad(x0: number, x1: number, y: number, ratio: number, waves = 3, samples = 120): Pt[] {
  const wave = (amp: number) => Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples;
    return { x: x0 + (x1 - x0) * t, y: y - amp * Math.sin(t * waves * 2 * Math.PI) };
  });
  const target = Math.max(ratio, 1) * (x1 - x0);
  let lo = 0, hi = (x1 - x0);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (length(wave(mid)) < target) lo = mid; else hi = mid;
  }
  return wave((lo + hi) / 2);
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
