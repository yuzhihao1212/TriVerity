"""Bounded, deterministic telemetry summaries; raw coordinates never enter prompts."""
from datetime import datetime, timezone
from math import isfinite

from pydantic import BaseModel

from app.core import limits
from app.models.dispute import TripData


class GpsStop(BaseModel):
    start_time: datetime
    duration_min: float
    lat: float
    lng: float


class GpsAnalysis(BaseModel):
    path_distance_km: float | None = None
    path_vs_expected_ratio: float | None = None
    unexpected_stops: list[GpsStop] | None = None
    # Sum of unexpected stops only; endpoint waiting and unknown gaps are excluded.
    total_stopped_min: float | None = None
    points_used: int | None = None
    points_rejected: int | None = None
    max_gap_min: float | None = None


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


def analyse_gps(raw_points: list[dict], trip: TripData, *, route_trip: bool = False) -> GpsAnalysis | None:
    # Local import reuses the evidence helper without a module-import cycle.
    from app.services.evidence import _haversine_m

    if not raw_points:
        return None
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
    result = GpsAnalysis(points_used=len(ordered), points_rejected=rejected)
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
