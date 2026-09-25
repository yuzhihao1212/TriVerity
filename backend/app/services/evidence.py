from math import asin, cos, radians, sin, sqrt

from pydantic import BaseModel

from app.models.dispute import DisputeCase

EARTH_RADIUS_M = 6_371_000

class CaseFacts(BaseModel):
    """Facts computed deterministically from the case data.

    Agents may argue about what these facts mean, but must not contradict them.
    A value of None means the underlying data was not provided.
    """
    distance_excess_ratio: float | None = None
    duration_excess_ratio: float | None = None
    fare_difference: float | None = None
    driver_distance_from_pickup_m: float | None = None
    driver_wait_min: float | None = None
    driver_contact_attempted: bool = False

    def describe(self) -> list[str]:
        lines = []
        if self.distance_excess_ratio is not None:
            lines.append(f"Route was {self.distance_excess_ratio:+.0%} vs expected distance")
        if self.duration_excess_ratio is not None:
            lines.append(f"Trip took {self.duration_excess_ratio:+.0%} vs expected duration")
        if self.fare_difference is not None:
            lines.append(f"Fare was {self.fare_difference:+.2f} vs expected fare")
        if self.driver_distance_from_pickup_m is not None:
            lines.append(f"Driver arrived {self.driver_distance_from_pickup_m:.0f} m from pickup point")
        if self.driver_wait_min is not None:
            lines.append(f"Driver waited {self.driver_wait_min:g} min at pickup")
        lines.append(
            "Driver contacted rider via in-app chat"
            if self.driver_contact_attempted
            else "No driver contact attempt in chat log"
        )
        return lines

def _excess_ratio(expected: float | None, actual: float | None) -> float | None:
    if not expected or actual is None:
        return None
    return round(actual / expected - 1, 4)

def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(a))

def compute_facts(case: DisputeCase) -> CaseFacts:
    trip, fare = case.trip, case.fare

    fare_difference = None
    if fare.expected is not None and fare.actual is not None:
        fare_difference = round(fare.actual - fare.expected, 2)

    pickup_distance = None
    coords = (trip.pickup_lat, trip.pickup_lng, trip.driver_arrival_lat, trip.driver_arrival_lng)
    if all(c is not None for c in coords):
        pickup_distance = round(_haversine_m(*coords), 1)

    return CaseFacts(
        distance_excess_ratio=_excess_ratio(trip.expected_distance_km, trip.actual_distance_km),
        duration_excess_ratio=_excess_ratio(trip.expected_duration_min, trip.actual_duration_min),
        fare_difference=fare_difference,
        driver_distance_from_pickup_m=pickup_distance,
        driver_wait_min=trip.driver_wait_min,
        driver_contact_attempted=any(m.get("sender") == "driver" for m in case.chat_logs),
    )
