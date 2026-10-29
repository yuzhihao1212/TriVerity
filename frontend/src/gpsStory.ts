// The GPS card's story: a one-line headline, plain details, a route sketch and a timeline.
// Every value comes from the computed fact sentences (backend/app/services/evidence.py) or
// the case's own GPS points; nothing is invented. Pure functions, so they're testable.

import { parseRouteCoverage, parseStop } from "./factVisuals";
import { distanceText, minutesText, oneDecimal, trimDecimal } from "./numberFormat";
import { metres, type GpsPoint, type LatLng, type Pt } from "./tripVisuals";

export const OFF_ROUTE_METRES = 150;
export const ROUTE_SEEN_KEY = "triverity.routeIntroSeen";

/** "08:05" -> 485 (minutes after midnight). */
export function clockMinutes(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
}

export interface OffRoute { from: string; to: string; minutes: number; km: string; awayMetres: number }
export function parseOffRoute(text: string): OffRoute | null {
  const match = /^Off the planned route (\d{2}:\d{2})-(\d{2}:\d{2}): ([\d.,]+) km driven, up to ([\d,]+) m away$/.exec(text);
  if (!match) return null;
  let minutes = clockMinutes(match[2]) - clockMinutes(match[1]);
  if (minutes < 0) minutes += 24 * 60;
  return { from: match[1], to: match[2], minutes, km: trimDecimal(match[3]), awayMetres: Number(match[4].replace(/,/g, "")) };
}

/** "Off route 08:05–08:32", "11.3 km" driven, up to "2.7 km" from the planned path. */
export function offRouteDetail(off: OffRoute): { range: string; driven: string; away: string } {
  return { range: `${off.from}–${off.to}`, driven: `${off.km} km`, away: distanceText(off.awayMetres) };
}

/** "78% of GPS readings were off the planned route (8 of 36 within 150 m)". */
export function coverageSummary(text: string): { offPercent: number; onRoute: number; total: number; metres: number } | null {
  const coverage = parseRouteCoverage(text);
  if (!coverage || !coverage.total) return null;
  return { offPercent: Math.round(((coverage.total - coverage.onRoute) / coverage.total) * 100), onRoute: coverage.onRoute, total: coverage.total, metres: coverage.meters };
}

export interface StopFact { minutes: number; time: string; where?: string; noShow: boolean }
/** Distinct stops (a stop is often stated two or three times). */
export function stopFacts(facts: string[]): StopFact[] {
  const seen = new Map<string, StopFact>();
  for (const text of facts) {
    const stop = parseStop(text);
    if (!stop) continue;
    const key = `${stop.time}:${stop.minutes}`;
    const noShow = /^Driver stopped/.test(text);
    const previous = seen.get(key);
    if (!previous || (noShow && !previous.noShow)) seen.set(key, { ...stop, noShow: noShow || !!previous?.noShow, where: stop.where ?? previous?.where });
  }
  return [...seen.values()];
}

function hasPlannedRouteFacts(facts: string[]): boolean {
  return facts.some(text => /^Off the planned route/.test(text) || !!parseRouteCoverage(text));
}

/** One plain sentence that says what the GPS shows, or null when there's nothing to say. */
export function gpsHeadline(facts: string[]): string | null {
  const stops = stopFacts(facts);
  if (!hasPlannedRouteFacts(facts)) {
    const noShow = stops.find(stop => stop.noShow) ?? stops[0];
    if (!noShow) return null;
    const where = noShow.where ? `, ${noShow.where.replace(/ from pickup$/, " from the pickup point")}` : "";
    return `The driver stopped for ${minutesText(noShow.minutes)}${where}.`;
  }
  const offMinutes = facts.map(parseOffRoute).reduce((sum, off) => sum + (off?.minutes ?? 0), 0);
  const stopMinutes = stops.filter(stop => !stop.noShow).reduce((sum, stop) => sum + stop.minutes, 0);
  if (offMinutes > 0 && stopMinutes > 0) return `The car left the planned route for ${minutesText(offMinutes)} and stopped for ${minutesText(stopMinutes)} along the way.`;
  if (offMinutes > 0) return `The car left the planned route for ${minutesText(offMinutes)}.`;
  if (stopMinutes > 0) return `The car followed the planned route but stopped for ${minutesText(stopMinutes)}.`;
  return "The car stayed on the planned route.";
}

// ---- Geometry -----------------------------------------------------------------

/** Shortest distance in metres from a point to a polyline (metres() to the nearest point on it). */
export function distanceToRoute(point: LatLng, route: LatLng[]): number {
  if (!route.length) return Infinity;
  if (route.length === 1) return metres(point, route[0]);
  const scale = Math.cos((point.lat * Math.PI) / 180);
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    // Nearest point on the segment, in a local flat frame (lng scaled by cos(lat)).
    const ax = (a.lng - point.lng) * scale, ay = a.lat - point.lat;
    const bx = (b.lng - point.lng) * scale, by = b.lat - point.lat;
    const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
    const t = length ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / length)) : 0;
    best = Math.min(best, metres(point, { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }));
  }
  return best;
}

/** Which GPS points are more than `limit` metres from the planned route (none without a plan). */
export function offRouteFlags(points: LatLng[], route: LatLng[], limit = OFF_ROUTE_METRES): boolean[] {
  return points.map(point => route.length >= 2 && distanceToRoute(point, route) > limit);
}

/**
 * Consecutive stretches of the driven line, as point-index ranges. A stretch between two
 * points is off route when either end is (so the departure and return are shown); neighbouring
 * runs share their boundary point, so the line has no breaks.
 */
export function routeRuns(flags: boolean[]): { from: number; to: number; off: boolean }[] {
  const runs: { from: number; to: number; off: boolean }[] = [];
  for (let i = 1; i < flags.length; i++) {
    const off = flags[i - 1] || flags[i];
    const last = runs.at(-1);
    if (last && last.off === off) last.to = i; else runs.push({ from: i - 1, to: i, off });
  }
  return runs;
}

/**
 * Equirectangular projection fitted to both lines (lng scaled by cos(lat)), centred in a
 * `width` x `height` box with `pad` around it. North is up.
 */
export function projectRoutes(planned: LatLng[], actual: LatLng[], width: number, height: number, pad = 12): { planned: Pt[]; actual: Pt[] } {
  const all = [...planned, ...actual];
  if (!all.length) return { planned: [], actual: [] };
  const meanLat = all.reduce((sum, p) => sum + p.lat, 0) / all.length;
  const scale = Math.cos((meanLat * Math.PI) / 180);
  const xs = all.map(p => p.lng * scale), ys = all.map(p => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-9, spanY = maxY - minY || 1e-9;
  const k = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offsetX = (width - spanX * k) / 2, offsetY = (height - spanY * k) / 2;
  const project = (p: LatLng): Pt => ({ x: offsetX + (p.lng * scale - minX) * k, y: height - (offsetY + (p.lat - minY) * k) });
  return { planned: planned.map(project), actual: actual.map(project) };
}

/** "08:14" from "2026-09-20T08:14:00+08:00": the clock as recorded, never shifted by time zone. */
export function pointClock(timestamp?: string | null): string | null {
  return /T(\d{2}:\d{2})/.exec(timestamp ?? "")?.[1] ?? null;
}

/** Index of the GPS point recorded nearest to a clock time ("08:14"), or -1. */
export function nearestPointIndex(points: GpsPoint[], clock: string): number {
  const target = clockMinutes(clock);
  let best = -1, bestDelta = Infinity;
  points.forEach((point, index) => {
    const own = pointClock(point.timestamp);
    if (!own) return;
    const delta = Math.abs(clockMinutes(own) - target);
    if (delta < bestDelta) { best = index; bestDelta = delta; }
  });
  return best;
}

// ---- Timeline -----------------------------------------------------------------

export interface Timeline {
  start: string; end: string; totalMinutes: number;
  /** Fractions 0..1 of the timeline. */
  segments: { from: number; to: number; off: boolean }[];
  stops: { at: number; width: number; clock: string; minutes: number; label: string }[];
  gaps: { from: number; to: number; minutes: number; label: string }[];
}

/**
 * The trip on a time axis: on/off route stretches, stop pins and data gaps. Needs at least
 * two timestamped points; `gapMinutes` come from "GPS data gap of N min" facts.
 */
export function gpsTimeline(points: GpsPoint[], flags: boolean[], stops: StopFact[], gapMinutes: number[] = []): Timeline | null {
  const timed = points.map((point, index) => ({ index, clock: pointClock(point.timestamp) }))
    .filter((p): p is { index: number; clock: string } => !!p.clock);
  if (timed.length < 2) return null;
  const startMin = clockMinutes(timed[0].clock), endMin = clockMinutes(timed.at(-1)!.clock);
  const total = endMin - startMin;
  if (total <= 0) return null;
  const at = (clock: string) => Math.min(1, Math.max(0, (clockMinutes(clock) - startMin) / total));
  const segments: Timeline["segments"] = [];
  for (let i = 1; i < timed.length; i++) {
    const off = !!(flags[timed[i - 1].index] || flags[timed[i].index]);
    const from = at(timed[i - 1].clock), to = at(timed[i].clock);
    const last = segments.at(-1);
    if (last && last.off === off) last.to = to; else segments.push({ from, to, off });
  }
  const gaps: Timeline["gaps"] = [];
  for (const minutes of gapMinutes) {
    for (let i = 1; i < timed.length; i++) {
      const delta = clockMinutes(timed[i].clock) - clockMinutes(timed[i - 1].clock);
      if (delta >= minutes - 0.5 && !gaps.some(gap => gap.from === at(timed[i - 1].clock))) {
        gaps.push({ from: at(timed[i - 1].clock), to: at(timed[i].clock), minutes, label: `GPS data gap: ${trimDecimal(String(minutes))} min` });
        break;
      }
    }
  }
  return {
    start: timed[0].clock, end: timed.at(-1)!.clock, totalMinutes: total, segments, gaps,
    stops: stops.map(stop => ({ at: at(stop.time), width: Math.min(1, stop.minutes / total), clock: stop.time, minutes: stop.minutes,
      label: `${stop.time} · ${trimDecimal(String(stop.minutes))} min` })),
  };
}

/** "GPS data gap of 4 min" -> 4. */
export function gapMinutes(facts: string[]): number[] {
  return facts.map(text => /^GPS data gap of (\d+(?:\.\d+)?) min$/.exec(text)?.[1]).filter((m): m is string => !!m).map(Number);
}

/**
 * Rows for labels at `positions` (0..1) so neighbours never overlap: a label goes on the first
 * row whose previous label is at least `minGap` away.
 */
export function labelRows(positions: number[], minGap: number, rows = 2): number[] {
  const last: number[] = Array(rows).fill(-Infinity);
  return positions.map(position => {
    let row = last.findIndex(previous => position - previous >= minGap);
    if (row === -1) row = last.indexOf(Math.min(...last));
    last[row] = position;
    return row;
  });
}

/** Text for the sketch's aria-label. */
export function sketchLabel(offMinutes: number, stops: StopFact[], hasPlan: boolean): string {
  const parts = [hasPlan ? "Route sketch: the planned route as a dashed line and the driven route" : "Route sketch of the driven route"];
  if (hasPlan) parts.push(offMinutes > 0 ? `, amber where it was more than ${OFF_ROUTE_METRES} m from the plan` : `, which stayed within ${OFF_ROUTE_METRES} m of the plan`);
  if (stops.length) parts.push(`; ${stops.map(stop => `a ${oneDecimal(stop.minutes)}-minute stop at ${stop.time}`).join(", ")}`);
  return `${parts.join("")}.`;
}

export function totalOffMinutes(facts: string[]): number {
  return facts.map(parseOffRoute).reduce((sum, off) => sum + (off?.minutes ?? 0), 0);
}

/** Prefer the recorded episode boundaries for labels; geometry remains display-only. */
export function labelledTimeline(points: GpsPoint[], planned: LatLng[], facts: string[]): Timeline | null {
  const timeline = gpsTimeline(points, offRouteFlags(points, planned.length >= 2 ? planned : []), stopFacts(facts), gapMinutes(facts));
  if (!timeline) return null;
  const start = clockMinutes(timeline.start);
  const at = (clock: string) => Math.max(0, Math.min(1, (clockMinutes(clock) - start) / timeline.totalMinutes));
  const episodes = facts.map(parseOffRoute).filter((off): off is OffRoute => !!off)
    .map(off => ({ from: at(off.from), to: at(off.to) })).filter(off => off.to > off.from);
  if (!episodes.length) return timeline;
  const edges = [...new Set([0, 1, ...episodes.flatMap(off => [off.from, off.to])])].sort((a, b) => a - b);
  const segments: Timeline["segments"] = [];
  for (let i = 1; i < edges.length; i++) {
    const from = edges[i - 1], to = edges[i];
    const off = episodes.some(episode => (from + to) / 2 >= episode.from && (from + to) / 2 <= episode.to);
    const last = segments.at(-1);
    if (last && last.off === off) last.to = to; else segments.push({ from, to, off });
  }
  return { ...timeline, segments };
}
export function timelineClock(timeline: Timeline, fraction: number): string {
  const minutes = Math.round(clockMinutes(timeline.start) + fraction * timeline.totalMinutes);
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export function timelineTicks(timeline: Timeline) {
  return [...new Set([0, 1, ...timeline.segments.filter(s => s.off).flatMap(s => [s.from, s.to])])]
    .sort((a, b) => a - b).map(at => ({ at, label: timelineClock(timeline, at) }));
}
