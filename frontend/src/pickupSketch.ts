// Geometry for the no-show pickup sketch: where the driver waited compared with the pickup
// point. Pure functions, so they're testable; every position comes from the dispute's own data.
import { metres, type GpsPoint, type LatLng, type Pt } from "./tripVisuals";
import type { Trip } from "./types";

/** NS-1: a no-show fee applies only if the driver arrived within this distance of pickup. */
export const PICKUP_LIMIT_M = 100;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const usable = (points: GpsPoint[]) => points.filter(p => finite(p.lat) && finite(p.lng));

/** True when the car never moved: every reading within 30 m of the first (a driver waiting). */
export function isParked(points: GpsPoint[]): boolean {
  const valid = usable(points);
  return valid.length >= 1 && valid.every(p => metres(p, valid[0]) < 30);
}

export interface PickupLayout {
  pickup: Pt; driver: Pt; zoneRadius: number;
  /** Real distance in metres; `toScale` is false when the marker was nudged apart to stay readable. */
  distance: number; inside: boolean; toScale: boolean;
}

/**
 * Pickup at its place, the driver's stop at its bearing and distance, and the pickup zone as a
 * circle, all fitted into a w × h box. A driver almost on top of the pin is drawn a little apart
 * (toScale false) so the two markers never overlap.
 */
export function pickupLayout(trip: Trip | undefined, w: number, h: number, pad = 48): PickupLayout | null {
  if (!trip || !finite(trip.pickup_lat) || !finite(trip.pickup_lng) || !finite(trip.driver_arrival_lat) || !finite(trip.driver_arrival_lng)) return null;
  const pickup: LatLng = { lat: trip.pickup_lat, lng: trip.pickup_lng };
  const arrival: LatLng = { lat: trip.driver_arrival_lat, lng: trip.driver_arrival_lng };
  const distance = metres(pickup, arrival);
  const east = metres(pickup, { lat: pickup.lat, lng: arrival.lng }) * Math.sign(arrival.lng - pickup.lng);
  const north = metres(pickup, { lat: arrival.lat, lng: pickup.lng }) * Math.sign(arrival.lat - pickup.lat);
  const angle = distance > 0 ? Math.atan2(north, east) : 0;
  const minShown = PICKUP_LIMIT_M * 0.45;
  const shown = Math.max(distance, minShown);
  const dx = Math.cos(angle) * shown, dy = Math.sin(angle) * shown;
  // Bounding box in metres (east right, north up) of the zone circle and the driver's stop.
  const left = Math.min(-PICKUP_LIMIT_M, dx), right = Math.max(PICKUP_LIMIT_M, dx);
  const bottom = Math.min(-PICKUP_LIMIT_M, dy), top = Math.max(PICKUP_LIMIT_M, dy);
  const scale = Math.min((w - 2 * pad) / (right - left), (h - 2 * pad) / (top - bottom));
  const ox = w / 2 - ((left + right) / 2) * scale, oy = h / 2 + ((bottom + top) / 2) * scale;
  const at = (x: number, y: number): Pt => ({ x: ox + x * scale, y: oy - y * scale });
  return { pickup: at(0, 0), driver: at(dx, dy), zoneRadius: PICKUP_LIMIT_M * scale, distance, inside: distance <= PICKUP_LIMIT_M, toScale: distance >= minShown };
}

/** Each timestamped reading's place (0–1) between the first and last reading. */
export function readingMarks(points: GpsPoint[]): number[] {
  const times = usable(points).map(p => p.timestamp ? Date.parse(p.timestamp) : NaN).filter(Number.isFinite);
  if (times.length < 2) return [];
  const first = Math.min(...times), span = Math.max(...times) - first;
  return span > 0 ? times.map(t => (t - first) / span) : [];
}
