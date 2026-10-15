"""Mock data-source APIs and the deterministic evidence tools built on them.

Each API class stands in for a Ryde service (trips, telemetry, payments, messaging).
Today they read from the DisputeCase; in production each would call the real service,
and the tools above them would not change. Tools compute every fact in code and return
short plain-text lines: the Evidence Collection agent chooses which tools to call, but
never produces evidence itself.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, time
from typing import Callable

from app.core import limits
from app.models.dispute import ChatMessage, DisputeCase
from app.services.gps_analysis import analyse_gps, parse_points
from app.services.text_safety import sanitise

_HHMM_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


# -- Mock APIs -----------------------------------------------------------------

class TripAPI:
    def __init__(self, case: DisputeCase):
        self.trip, self.fare = case.trip, case.fare


class TelemetryAPI:
    def __init__(self, case: DisputeCase):
        self.points, self.rejected = parse_points(case.gps_points) if case.gps_points else ([], 0)
        self.case = case


class PaymentsAPI:
    def __init__(self, case: DisputeCase):
        self.fare = case.fare


class MessagingAPI:
    """In-app chat and app events (system messages, e.g. from the organisers' dataset)."""

    def __init__(self, case: DisputeCase):
        self.messages = [m for m in case.chat_logs if m.sender in ("rider", "driver")]
        self.events = [m for m in case.chat_logs if m.sender == "system"]


@dataclass
class DataSources:
    trips: TripAPI
    telemetry: TelemetryAPI
    payments: PaymentsAPI
    messaging: MessagingAPI
    case: DisputeCase

    @classmethod
    def for_case(cls, case: DisputeCase) -> "DataSources":
        return cls(TripAPI(case), TelemetryAPI(case), PaymentsAPI(case), MessagingAPI(case), case)


# -- Helpers -------------------------------------------------------------------

def parse_hhmm(value: object) -> time | None:
    if not isinstance(value, str):
        return None
    match = _HHMM_RE.match(value.strip())
    return time(int(match.group(1)), int(match.group(2))) if match else None


def _clock(moment: datetime) -> time:
    return moment.time().replace(second=0, microsecond=0)


def _message_time(message: ChatMessage) -> datetime | None:
    if not message.timestamp:
        return None
    try:
        return datetime.fromisoformat(message.timestamp.replace("Z", "+00:00"))
    except ValueError:
        return None


def _quote(text: str) -> str:
    text = sanitise(text)
    if len(text) > limits.EVIDENCE_QUOTE_MAX_CHARS:
        text = text[: limits.EVIDENCE_QUOTE_MAX_CHARS - 1].rstrip() + "…"
    return text


def _haversine_m(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    from app.services.evidence import _haversine_m as haversine
    return haversine(a_lat, a_lng, b_lat, b_lng)


# -- Tools ---------------------------------------------------------------------
# Each tool: (sources, args) -> list of fact lines. Arguments are already validated.

def trip_record(src: DataSources, args: dict) -> list[str]:
    trip, fare = src.trips.trip, src.trips.fare
    lines = []
    if trip.expected_distance_km is not None or trip.actual_distance_km is not None:
        lines.append(f"Trip record: distance expected {trip.expected_distance_km} km, actual {trip.actual_distance_km} km")
    if trip.expected_duration_min is not None or trip.actual_duration_min is not None:
        lines.append(f"Trip record: duration expected {trip.expected_duration_min} min, actual {trip.actual_duration_min} min")
    if trip.driver_wait_min is not None:
        lines.append(f"Trip record: driver wait logged as {trip.driver_wait_min:g} min")
    if fare.cancellation_fee is not None:
        lines.append(f"Trip record: no-show fee charged ${fare.cancellation_fee:.2f}")
    return lines or ["Trip record: no distance, duration or wait data"]


def gps_window(src: DataSources, args: dict) -> list[str]:
    start, end = args["start"], args["end"]
    pts = [p for p in src.telemetry.points if start <= _clock(p[1]) <= end]
    label = f"{start:%H:%M}-{end:%H:%M}"
    if not pts:
        return [f"GPS {label}: no points in this window"]
    dist = sum(_haversine_m(a[2], a[3], b[2], b[3]) for a, b in zip(pts, pts[1:]))
    speeds = [p[4] for p in pts if p[4] is not None]
    line = f"GPS {label}: {len(pts)} points, moved {dist / 1000:.2f} km"
    if speeds:
        line += f", speed avg {sum(speeds) / len(speeds):.0f} km/h, max {max(speeds):.0f} km/h"
    trip = src.trips.trip
    if trip.pickup_lat is not None and trip.pickup_lng is not None:
        nearest = min(_haversine_m(p[2], p[3], trip.pickup_lat, trip.pickup_lng) for p in pts)
        line += f", closest to pickup {nearest:.0f} m"
    statuses = sorted({p[5] for p in pts if p[5]})
    if statuses:
        line += f", status {', '.join(statuses)}"
    return [line]


def gps_stops(src: DataSources, args: dict) -> list[str]:
    case = src.case
    gps = analyse_gps(case.gps_points, case.trip, route_trip=case.type == "route_deviation") if case.gps_points else None
    if gps is None or not gps.unexpected_stops:
        return ["GPS stops: no stops of 3 min or more away from pickup and drop-off"]
    trip = case.trip
    lines = []
    for stop in gps.unexpected_stops[: limits.EVIDENCE_TOOL_MAX_LINES]:
        where = ""
        if trip.pickup_lat is not None and trip.pickup_lng is not None:
            where = f", {_haversine_m(stop.lat, stop.lng, trip.pickup_lat, trip.pickup_lng):.0f} m from pickup"
        lines.append(f"GPS stop: {stop.duration_min:g} min from {stop.start_time:%H:%M}{where}")
    return lines


def fare_lines(src: DataSources, args: dict) -> list[str]:
    fare = src.payments.fare
    lines = [f"Fare line: {sanitise(line.label)[:60]} ${line.amount:.2f}" for line in fare.breakdown[: limits.EVIDENCE_TOOL_MAX_LINES]]
    if fare.surge_multiplier is not None:
        lines.append(f"Fare: surge multiplier x{fare.surge_multiplier:g}")
    if fare.promo_code:
        discount = f" (${fare.promo_discount:.2f} off)" if fare.promo_discount is not None else " (no discount recorded)"
        lines.append(f"Fare: promo {fare.promo_code}{discount}")
    if fare.actual is not None:
        lines.append(f"Fare: charged ${fare.actual:.2f}" + (f", expected ${fare.expected:.2f}" if fare.expected is not None else ""))
    return lines or ["Fare: no itemised breakdown or charge recorded"]


def chat_window(src: DataSources, args: dict) -> list[str]:
    start, end = args["start"], args["end"]
    picked = []
    for message in src.messaging.messages:
        moment = _message_time(message)
        if moment is not None and start <= _clock(moment) <= end:
            picked.append(f'Chat {moment:%H:%M} {message.sender}: "{_quote(message.message)}"')
    if not picked:
        return [f"Chat {start:%H:%M}-{end:%H:%M}: no messages in this window"]
    return picked[: limits.EVIDENCE_TOOL_MAX_LINES]


_EVENT_RE = re.compile(r"^\[app event\] ([a-z][a-z_]{0,39}):")


def app_events(src: DataSources, args: dict) -> list[str]:
    """Event types and times only, from messages in the platform's own format.

    Free-text details are dropped: ``system`` messages arrive in the request, so their
    text is untrusted (attack PI-06), and the organisers' details carry user IDs.
    """
    lines = []
    for event in src.messaging.events:
        match = _EVENT_RE.match(event.message)
        if not match:
            continue
        moment = _message_time(event)
        lines.append(f"App event {moment:%H:%M} {match.group(1)}" if moment else f"App event {match.group(1)}")
    return lines[: limits.EVIDENCE_TOOL_MAX_LINES] or ["App events: none recorded"]


@dataclass(frozen=True)
class Tool:
    name: str
    source: str           # evidence group the lines join: trip, gps, fare or chat
    description: str
    window: bool          # takes {"start": "HH:MM", "end": "HH:MM"}
    run: Callable[[DataSources, dict], list[str]]


TOOLS: dict[str, Tool] = {t.name: t for t in (
    Tool("trip_record", "trip", "Raw trip record: expected vs actual distance and duration, logged wait, no-show fee.", False, trip_record),
    Tool("gps_window", "gps", "GPS telemetry between two clock times: distance moved, speeds, closest approach to pickup, status.", True, gps_window),
    Tool("gps_stops", "gps", "Every stop of 3+ minutes away from pickup and drop-off, with time and distance from pickup.", False, gps_stops),
    Tool("fare_lines", "fare", "Itemised fare lines, surge multiplier, promo code and discount, charged vs expected fare.", False, fare_lines),
    Tool("chat_window", "chat", "Rider and driver chat messages between two clock times, quoted.", True, chat_window),
    Tool("app_events", "chat", "App event timeline (booking, arrival, cancellation, calls) from the platform logs.", False, app_events),
)}


def data_available(src: DataSources) -> dict:
    """What each source holds, so the agent can plan sensible calls."""
    def span(times: list[datetime]) -> str | None:
        return f"{min(times):%H:%M}-{max(times):%H:%M}" if times else None
    chat_times = [t for m in src.messaging.messages if (t := _message_time(m))]
    return {
        "gps_points": len(src.telemetry.points),
        "gps_time_span": span([p[1] for p in src.telemetry.points]),
        "chat_messages": len(src.messaging.messages),
        "chat_time_span": span(chat_times),
        "app_events": len(src.messaging.events),
        "fare_breakdown_lines": len(src.payments.fare.breakdown),
    }
