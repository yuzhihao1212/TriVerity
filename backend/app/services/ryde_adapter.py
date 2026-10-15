"""Convert the organisers' RydeResolve dataset format into a DisputeCase.

Fields with no DisputeCase equivalent are left out rather than guessed:
lifetime dispute counts are not a 90-day count, and fraud flags would bypass
our own Fraud agent. The dataset's cancellation_policy (5 min free wait) is
already covered by NS-2, so the mock policy still decides.
"""
from datetime import datetime

from app.models.dispute import DisputeCase


def _minutes_between(start: str | None, end: str | None) -> float | None:
    if not start or not end:
        return None
    delta = datetime.fromisoformat(end) - datetime.fromisoformat(start)
    return round(delta.total_seconds() / 60, 2)


def _history(profile: dict) -> dict:
    return {
        "account_age_days": profile.get("account_age_days"),
        "rating": profile.get("avg_rating"),
        "completed_trips": profile.get("total_trips"),
    }


def _chat(raw: dict) -> list[dict]:
    lines = []
    for m in raw.get("chat_logs", []):
        text = m["content"]
        if m.get("type") == "call":
            text = f"[call] {text}"
        lines.append({"sender": m["sender"], "message": text, "timestamp": m.get("timestamp")})
    # App events are the platform's own log (arrival, notifications, timers); agents
    # see them as system messages so they can cite them.
    for e in raw.get("app_events", []):
        lines.append({
            "sender": "system",
            "message": f"[app event] {e['event_type']}: {e['details']}",
            "timestamp": e.get("timestamp"),
        })
    # ponytail: string sort works because the dataset uses one UTC offset throughout
    return sorted(lines, key=lambda m: m["timestamp"] or "")


def to_dispute_case(raw: dict) -> DisputeCase:
    ticket, trip = raw["dispute_ticket"], raw.get("trip_data", {})
    gps = raw.get("gps_telemetry", [])
    pickup = trip.get("pickup_location", {})
    arrived = next((p for p in gps if p.get("status") == "arrived"), None)

    return DisputeCase(
        dispute_id=ticket["dispute_id"],
        type=ticket["dispute_type"],
        label="Organisers' case: lobby no-show" if ticket["dispute_id"] == "DISP-002" else None,
        rider_claim=ticket["description"],
        trip={
            "pickup_lat": pickup.get("lat"),
            "pickup_lng": pickup.get("lng"),
            "driver_arrival_lat": arrived["lat"] if arrived else None,
            "driver_arrival_lng": arrived["lng"] if arrived else None,
            "driver_wait_min": _minutes_between(trip.get("driver_wait_start"), trip.get("cancellation_time")),
        },
        fare={"cancellation_fee": trip.get("cancellation_fee")},
        chat_logs=_chat(raw),
        gps_points=gps,
        rider_history=_history(raw.get("rider_profile", {})),
        driver_history=_history(raw.get("driver_profile", {})),
    )
