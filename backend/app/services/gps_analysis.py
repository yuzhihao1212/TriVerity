"""Bounded, deterministic telemetry summaries; raw coordinates never enter prompts."""
from datetime import datetime, timezone
from math import cos, hypot, isfinite, radians

from pydantic import BaseModel

from app.core import limits
from app.models.dispute import TripData


class GpsStop(BaseModel):
    start_time: datetime
    duration_min: float
    lat: float
    lng: float


class OffRouteEpisode(BaseModel):
    start_time: datetime
    end_time: datetime
    distance_km: float      # GPS path driven while off the planned route
    max_offset_m: float     # furthest point from the planned route


class RouteComparison(BaseModel):
    """GPS path against the platform's planned (optimal) route, point by point."""
    points_checked: int
    points_on_route: int    # within GPS_OFF_ROUTE_M of the planned route
    max_offset_m: float
    off_route_km: float
    episodes: list[OffRouteEpisode]


class GpsAnalysis(BaseModel):
    path_distance_km: float | None = None
    path_vs_expected_ratio: float | None = None
    unexpected_stops: list[GpsStop] | None = None
    # Sum of unexpected stops only; endpoint waiting and unknown gaps are excluded.
    total_stopped_min: float | None = None
    points_used: int | None = None
    points_rejected: int | None = None
    max_gap_min: float | None = None
    route_comparison: RouteComparison | None = None


def _number(value: object) -> float:
    # Do not coerce arbitrary objects or booleans into coordinates/speeds.
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise ValueError
    result = float(value)
    if not isfinite(result):
        raise ValueError
    return result


def _ordered(points: list[tuple]) -> list[tuple]:
    """Stable radix sort: eight fixed byte passes over datetime microsecond keys.

    Python's datetime range fits in 59 bits. Unlike comparison sorting, this is
    O(n), including unsorted input, with bounded O(n) working memory.
    """
    for shift in range(0, 64, 8):
        buckets = [[] for _ in range(256)]
        for point in points:
            buckets[(point[0] >> shift) & 255].append(point)
        points = [point for bucket in buckets for point in bucket]
    return points


def parse_points(raw_points: list[dict]) -> tuple[list[tuple], int]:
    """Validated, time-ordered points as (key, time, lat, lng, speed, status), and the reject count.

    Every point is untrusted: invalid ones are counted, never raised.
    """
    points = []
    rejected = max(0, len(raw_points) - limits.MAX_GPS_POINTS)
    for raw in raw_points[:limits.MAX_GPS_POINTS]:
        try:
            lat, lng = _number(raw['lat']), _number(raw['lng'])
            if not (-limits.GPS_MAX_LATITUDE <= lat <= limits.GPS_MAX_LATITUDE
                    and -limits.GPS_MAX_LONGITUDE <= lng <= limits.GPS_MAX_LONGITUDE):
                raise ValueError
            stamp = raw['timestamp']
            if not isinstance(stamp, str) or len(stamp) > limits.MAX_TIMESTAMP_CHARS:
                raise ValueError
            # A date without a time isn't a telemetry timestamp. Naive ISO times
            # use UTC consistently; aware times retain their offset for display.
            if 'T' not in stamp and ' ' not in stamp:
                raise ValueError
            time = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
            if time.tzinfo is None:
                time = time.replace(tzinfo=timezone.utc)
            utc = time.astimezone(timezone.utc)
            delta = utc.replace(tzinfo=None) - datetime.min
            key = (delta.days * 86400 + delta.seconds) * 1_000_000 + delta.microseconds
            speed = _number(raw['speed_kmh']) if raw.get('speed_kmh') is not None else None
            if speed is not None and speed < 0:
                raise ValueError
            status = raw.get('status')
            status = status.casefold() if isinstance(status, str) else ''
            points.append((key, time, lat, lng, speed, status))
        except (KeyError, TypeError, ValueError, OverflowError):
            rejected += 1
    ordered = []
    for point in _ordered(points):
        # Same-time samples cannot establish movement or elapsed stop time.
        # Keep the first valid observation, including for conflicting duplicates.
        if ordered and point[0] == ordered[-1][0]:
            rejected += 1
        else:
            ordered.append(point)
    return ordered, rejected


def analyse_gps(raw_points: list[dict], trip: TripData, *, route_trip: bool = False) -> GpsAnalysis | None:
    # Local import reuses the evidence helper without a module-import cycle.
    from app.services.evidence import _haversine_m

    if not raw_points:
        return None
    ordered, rejected = parse_points(raw_points)
    result = GpsAnalysis(points_used=len(ordered), points_rejected=rejected)
    if len(trip.planned_route) >= 2 and ordered:
        result.route_comparison = compare_to_route(ordered, [(p.lat, p.lng) for p in trip.planned_route])
    if len(ordered) < 2:
        return result

    def distance(a, b):
        return _haversine_m(a[2], a[3], b[2], b[3])

    def excluded(point):
        if point[5] in ('arrived', 'dropoff', 'dropped_off', 'completed'):
            return True
        if trip.pickup_lat is not None and trip.pickup_lng is not None:
            if _haversine_m(point[2], point[3], trip.pickup_lat, trip.pickup_lng) <= limits.GPS_ENDPOINT_RADIUS_M:
                return True
        # TripData has no drop-off coordinates. Only route trips use the final
        # observed position as an inferred endpoint; never do this for no-shows.
        return route_trip and distance(point, ordered[-1]) <= limits.GPS_ENDPOINT_RADIUS_M

    stops = []
    anchor = None
    end = None

    def finish():
        if anchor is not None and end is not None:
            duration = (end[0] - anchor[0]) / 60_000_000
            if duration >= limits.GPS_STOP_MIN_DURATION_MIN:
                stops.append(GpsStop(start_time=anchor[1], duration_min=duration,
                                     lat=anchor[2], lng=anchor[3]))

    path_m = 0.0
    max_gap = 0.0
    previous = None
    for point in ordered:
        gap = (point[0] - previous[0]) / 60_000_000 if previous else 0
        if previous:
            path_m += distance(previous, point)
            max_gap = max(max_gap, gap)
        if excluded(point) or gap > limits.GPS_STOP_MAX_GAP_MIN:
            finish()
            anchor = end = None
        if not excluded(point):
            slow = point[4] is not None and point[4] <= limits.GPS_STOP_SPEED_KMH
            if anchor is not None:
                # A stop lasts while the vehicle stays near where it stopped (allowing for GPS
                # drift). Slow movement beyond that is traffic, not a stop.
                if distance(anchor, point) <= limits.GPS_STOP_DRIFT_M:
                    end = point
                else:
                    finish()
                    anchor = end = None
            if anchor is None:
                if slow:
                    anchor = end = point
                elif (previous and gap <= limits.GPS_STOP_MAX_GAP_MIN and not excluded(previous)
                      and distance(previous, point) < limits.GPS_STOP_RADIUS_M):
                    anchor, end = previous, point
        previous = point
    finish()
    result.path_distance_km = path_m / 1000
    if trip.expected_distance_km:
        result.path_vs_expected_ratio = result.path_distance_km / trip.expected_distance_km
    result.unexpected_stops = stops
    result.total_stopped_min = sum(stop.duration_min for stop in stops)
    result.max_gap_min = max_gap
    return result


def _offset_m(lat: float, lng: float, route: list[tuple[float, float]]) -> float:
    """Distance in metres from a point to the nearest segment of the route.

    Uses a local flat projection around the point: accurate to well under a metre at
    city scale, which is all a ride needs.
    """
    m_lat, m_lng = 110_540.0, 111_320.0 * cos(radians(lat))
    best = float("inf")
    for (a_lat, a_lng), (b_lat, b_lng) in zip(route, route[1:]):
        ax, ay = (a_lng - lng) * m_lng, (a_lat - lat) * m_lat
        bx, by = (b_lng - lng) * m_lng, (b_lat - lat) * m_lat
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        share = 0.0 if length_sq == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / length_sq))
        best = min(best, hypot(ax + share * dx, ay + share * dy))
    return best


def compare_to_route(ordered: list[tuple], route: list[tuple[float, float]]) -> RouteComparison:
    """Measure how far each GPS point (time-ordered) strays from the planned route."""
    from app.services.evidence import _haversine_m

    offsets = [_offset_m(p[2], p[3], route) for p in ordered]
    off = [offset > limits.GPS_OFF_ROUTE_M for offset in offsets]
    # Episodes are runs of consecutive off-route points: [first index, last index, metres driven].
    episodes, episode_of = [], {}
    for i, is_off in enumerate(off):
        if is_off:
            if i == 0 or not off[i - 1]:
                episodes.append([i, i, 0.0])
            episodes[-1][1] = i
            episode_of[i] = len(episodes) - 1
    # A segment is off-route driving when either end is off the route; it belongs to
    # the episode it enters (or, when rejoining the route, the one it leaves).
    total_off_m = 0.0
    for i in range(1, len(ordered)):
        if off[i] or off[i - 1]:
            a, b = ordered[i - 1], ordered[i]
            segment = _haversine_m(a[2], a[3], b[2], b[3])
            total_off_m += segment
            episodes[episode_of[i] if off[i] else episode_of[i - 1]][2] += segment
    return RouteComparison(
        points_checked=len(ordered),
        points_on_route=off.count(False),
        max_offset_m=round(max(offsets), 1),
        off_route_km=round(total_off_m / 1000, 2),
        episodes=[OffRouteEpisode(start_time=ordered[first][1], end_time=ordered[last][1],
                                  distance_km=round(metres / 1000, 2),
                                  max_offset_m=round(max(offsets[first:last + 1]), 1))
                  for first, last, metres in episodes],
    )
