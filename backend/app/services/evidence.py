import re
from math import asin, cos, radians, sin, sqrt

from pydantic import BaseModel, Field

from app.core import limits
from app.services.gps_analysis import GpsAnalysis, analyse_gps

from app.models.dispute import ChatMessage, DisputeCase, DisputeType, FareData, PartyHistory
from app.services.text_safety import redact_contacts, sanitise

EARTH_RADIUS_M = 6_371_000

# Keyword baseline for chat analysis. Swap for an LLM classifier later, keeping
# the ChatAnalysis shape so the Judge and tests don't change.
THREAT_PATTERNS = [
    r"\bkill\b", r"\bhurt you\b", r"\bbeat you\b", r"\bfind you\b",
    r"\bregret\b", r"\bwatch yourself\b", r"\bor else\b",
]
AGREEMENT_PATTERNS = [
    r"\bok(ay)?\b", r"\bsure\b", r"\bagreed?\b", r"\bno problem\b",
    r"\bsounds good\b", r"\bon my way\b",
]
DISAGREEMENT_PATTERNS = [
    r"\bwrong\b", r"\bunfair\b", r"\bnot fair\b", r"\brefuse\b",
    r"\bdisagree\b", r"\bnot true\b", r"\blying\b", r"\bliar\b",
]

class ChatAnalysis(BaseModel):
    """Chat messages flagged by category, each quoted as 'sender: "message"'."""
    threats: list[str] = Field(default_factory=list)
    agreements: list[str] = Field(default_factory=list)
    disagreements: list[str] = Field(default_factory=list)

class CaseFacts(BaseModel):
    """Facts computed deterministically from the case data.

    Agents may argue about what these facts mean, but must not contradict them.
    A value of None means the underlying data was not provided.
    """
    dispute_type: DisputeType | None = None
    gps_stop_distances_from_pickup_m: list[float | None] = Field(default_factory=list)
    distance_excess_ratio: float | None = None
    duration_excess_ratio: float | None = None
    fare_difference: float | None = None
    driver_distance_from_pickup_m: float | None = None
    driver_wait_min: float | None = None
    driver_contact_attempted: bool = False
    surge_multiplier: float | None = None
    promo_code: str | None = None
    promo_discount: float | None = None
    # Charged fare minus (itemised breakdown - promo discount); non-zero means the
    # breakdown doesn't explain the charge.
    fare_breakdown_gap: float | None = None
    promo_applied_correctly: bool | None = None
    surge_consistent: bool | None = None
    gps: GpsAnalysis | None = None
    chat: ChatAnalysis = Field(default_factory=ChatAnalysis)
    rider_history: PartyHistory = Field(default_factory=PartyHistory)
    driver_history: PartyHistory = Field(default_factory=PartyHistory)
    # Lines gathered by the Evidence Collection agent's tools, by source; appended after
    # the core facts of that source (agents/evidence_agent.py).
    collected: dict[str, list[str]] = Field(default_factory=dict)

    def describe(self) -> list[str]:
        return [line for lines in self.describe_by_source().values() for line in lines]

    def describe_by_source(self) -> dict[str, list[str]]:
        groups = {source: [] for source in ("trip", "gps", "fare", "chat", "history")}
        lines = groups["trip"]
        if self.distance_excess_ratio is not None:
            lines.append(f"Route was {self.distance_excess_ratio:+.0%} vs expected distance")
        if self.duration_excess_ratio is not None:
            lines.append(f"Trip took {self.duration_excess_ratio:+.0%} vs expected duration")
        if self.driver_distance_from_pickup_m is not None:
            lines.append(f"Driver arrived {self.driver_distance_from_pickup_m:.0f} m from pickup point")
        if self.driver_wait_min is not None:
            lines.append(f"Driver waited {self.driver_wait_min:g} min at pickup")
        lines = groups["gps"]
        if self.gps is not None:
            gps = self.gps
            if gps.path_distance_km is not None:
                comparison = (f" ({gps.path_vs_expected_ratio - 1:+.0%} vs expected)"
                              if gps.path_vs_expected_ratio is not None else "")
                lines.append(f"GPS path {gps.path_distance_km:.1f} km over {gps.points_used} points{comparison}")
            else:
                lines.append(f"GPS path unavailable ({gps.points_used} usable {'point' if gps.points_used == 1 else 'points'})")
            for index, stop in enumerate(gps.unexpected_stops or []):
                if self.dispute_type == "no_show_charge":
                    distance = (self.gps_stop_distances_from_pickup_m[index]
                                if index < len(self.gps_stop_distances_from_pickup_m) else None)
                    location = f", {distance:.0f} m from the pickup point" if distance is not None else ""
                    lines.append(f"Driver stopped {stop.duration_min:g} min at {stop.start_time:%H:%M}{location}")
                else:
                    lines.append(f"Unexpected stop: {stop.duration_min:g} min at {stop.start_time:%H:%M}")
            if gps.total_stopped_min is not None:
                label = "GPS observed stops total" if self.dispute_type == "no_show_charge" else "GPS unexpected stops total"
                lines.append(f"{label} {gps.total_stopped_min:g} min")
            if gps.max_gap_min is not None and gps.max_gap_min > limits.GPS_REPORT_GAP_MIN:
                lines.append(f"GPS data gap of {gps.max_gap_min:g} min")
            if gps.points_rejected:
                lines.append(f"GPS points rejected: {gps.points_rejected}")
        lines = groups["fare"]
        if self.fare_difference is not None:
            lines.append(f"Fare was {self.fare_difference:+.2f} vs expected fare")
        if self.surge_multiplier and self.surge_multiplier > 1:
            lines.append(f"Surge pricing applied: x{self.surge_multiplier:g}")
        if self.promo_code:
            discount = f" ({self.promo_discount:.2f} off)" if self.promo_discount is not None else ""
            lines.append(f"Promo code {self.promo_code} applied{discount}")
        if self.fare_breakdown_gap is not None:
            lines.append(
                "Fare breakdown matches the charged fare"
                if abs(self.fare_breakdown_gap) < 0.01
                else f"Charged fare is {self.fare_breakdown_gap:+.2f} vs the itemised breakdown"
            )
        if self.promo_applied_correctly is not None:
            lines.append(
                f"Promo {self.promo_code} discount reflected in the charge"
                if self.promo_applied_correctly
                else f"Promo {self.promo_code} discount not reflected in the charge"
            )
        if self.surge_consistent is not None:
            lines.append(
                "Surge breakdown consistent with the multiplier"
                if self.surge_consistent
                else "Surge breakdown inconsistent with the multiplier"
            )
        lines = groups["chat"]
        lines.append(
            "Driver contacted rider via in-app chat"
            if self.driver_contact_attempted
            else "No driver contact attempt in chat log"
        )
        lines += [f"Threatening message: {m}" for m in self.chat.threats]
        lines += [f"Agreement in chat: {m}" for m in self.chat.agreements]
        lines += [f"Disagreement in chat: {m}" for m in self.chat.disagreements]
        lines = groups["history"]
        for party, history in (("Rider", self.rider_history), ("Driver", self.driver_history)):
            summary = _describe_history(history)
            if summary:
                lines.append(f"{party} history: {summary}")
        for source, extra in self.collected.items():
            bucket = groups.setdefault(source, [])
            bucket += [line for line in extra if line not in bucket]
        return {source: lines for source, lines in groups.items() if lines}

def _describe_history(history: PartyHistory) -> str:
    parts = []
    if history.account_age_days is not None:
        parts.append(f"account {history.account_age_days} days old")
    if history.rating is not None:
        parts.append(f"rating {history.rating:g}")
    if history.completed_trips is not None:
        parts.append(f"{history.completed_trips} trips")
    if history.disputes_last_90d is not None:
        parts.append(f"{history.disputes_last_90d} disputes in last 90 days")
    return ", ".join(parts)

def _matches(text: str, patterns: list[str]) -> bool:
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)

def analyse_chat(messages: list[ChatMessage]) -> ChatAnalysis:
    analysis = ChatAnalysis()
    for m in messages:
        # Quoted chat reaches the prompts, so strip control characters (H8) and contact details.
        quoted = f'{m.sender}: "{redact_contacts(sanitise(m.message))}"'
        if _matches(m.message, THREAT_PATTERNS):
            analysis.threats.append(quoted)
        elif _matches(m.message, DISAGREEMENT_PATTERNS):
            analysis.disagreements.append(quoted)
        elif _matches(m.message, AGREEMENT_PATTERNS):
            analysis.agreements.append(quoted)
    return analysis

def _excess_ratio(expected: float | None, actual: float | None) -> float | None:
    if not expected or actual is None:
        return None
    return round(actual / expected - 1, 4)

def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(min(1.0, max(0.0, a))))

def _promo_check(fare: FareData) -> bool | None:
    if not fare.promo_code:
        return None
    if fare.promo_discount is None:
        return None  # no recorded discount: the data is missing, not proof the promo was ignored
    if not fare.breakdown or fare.actual is None:
        return None
    expected_charge = sum(line.amount for line in fare.breakdown) - fare.promo_discount
    # Round the difference to eliminate binary floating point at the cent boundary.
    return abs(round(fare.actual - expected_charge, 6)) <= limits.FARE_PROMO_TOLERANCE


def _surge_check(fare: FareData) -> bool | None:
    if fare.surge_multiplier is None or fare.surge_multiplier <= 1 or not fare.breakdown:
        return None
    surge_lines = [line for line in fare.breakdown if re.search(r"\bsurge\b", line.label, re.IGNORECASE)]
    if not surge_lines:
        return None  # surge may be built into the base or distance lines, so it can't be checked
    # FareData defines the breakdown as pre-promo charges. Without typed tariff
    # components, use the non-surge subtotal as the multiplier's base. This checks
    # arithmetic, not tariff eligibility (e.g. whether a toll is surge-exempt).
    subtotal = sum(line.amount for line in fare.breakdown if line not in surge_lines)
    if subtotal <= 0:
        return None
    if any(line.amount < 0 for line in surge_lines):
        return False
    expected_surge = subtotal * (fare.surge_multiplier - 1)
    tolerance = max(limits.FARE_SURGE_ABS_TOLERANCE,
                    expected_surge * limits.FARE_SURGE_REL_TOLERANCE)
    return abs(round(sum(line.amount for line in surge_lines) - expected_surge, 6)) <= tolerance

def compute_facts(case: DisputeCase) -> CaseFacts:
    trip, fare = case.trip, case.fare

    fare_difference = None
    if fare.expected is not None and fare.actual is not None:
        fare_difference = round(fare.actual - fare.expected, 2)

    pickup_distance = None
    coords = (trip.pickup_lat, trip.pickup_lng, trip.driver_arrival_lat, trip.driver_arrival_lng)
    if all(c is not None for c in coords):
        pickup_distance = round(_haversine_m(*coords), 1)

    breakdown_gap = None
    if fare.breakdown and fare.actual is not None:
        itemised = sum(line.amount for line in fare.breakdown) - (fare.promo_discount or 0.0)
        breakdown_gap = round(fare.actual - itemised, 2)

    gps = analyse_gps(case.gps_points, trip, route_trip=case.type == "route_deviation")
    stop_distances = [
        _haversine_m(stop.lat, stop.lng, trip.pickup_lat, trip.pickup_lng)
        if trip.pickup_lat is not None and trip.pickup_lng is not None else None
        for stop in (gps.unexpected_stops or [])
    ] if gps else []

    return CaseFacts(
        dispute_type=case.type,
        gps_stop_distances_from_pickup_m=stop_distances,
        distance_excess_ratio=_excess_ratio(trip.expected_distance_km, trip.actual_distance_km),
        duration_excess_ratio=_excess_ratio(trip.expected_duration_min, trip.actual_duration_min),
        fare_difference=fare_difference,
        driver_distance_from_pickup_m=pickup_distance,
        driver_wait_min=trip.driver_wait_min,
        driver_contact_attempted=any(m.sender == "driver" for m in case.chat_logs),
        surge_multiplier=fare.surge_multiplier,
        promo_code=fare.promo_code,
        promo_discount=fare.promo_discount,
        fare_breakdown_gap=breakdown_gap,
        promo_applied_correctly=_promo_check(fare),
        surge_consistent=_surge_check(fare),
        gps=gps,
        chat=analyse_chat(case.chat_logs),
        rider_history=case.rider_history,
        driver_history=case.driver_history,
    )
