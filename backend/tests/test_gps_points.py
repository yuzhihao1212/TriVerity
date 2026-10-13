"""Proposal B: gps_points is capped (F2: 100,000 points used to return 200)."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.core import limits
from app.main import app

client = TestClient(app)
DISPUTES = Path(__file__).resolve().parents[2] / "data" / "disputes"


def _with_points(n: int) -> dict:
    payload = json.loads((DISPUTES / "route_deviation_001.json").read_text())
    payload["gps_points"] = [{"lat": 1.3, "lng": 103.8}] * n
    return payload


def test_gps_points_at_the_cap_accepted():
    assert client.post("/api/disputes/resolve", json=_with_points(limits.MAX_GPS_POINTS)).status_code == 200


def test_gps_points_over_the_cap_rejected():
    assert client.post("/api/disputes/resolve", json=_with_points(limits.MAX_GPS_POINTS + 1)).status_code == 422


def test_realistic_trip_log_fits_under_the_body_cap():
    """A 35-minute trip logged once a second (~2,100 points) must be accepted, and so must
    the full cap of realistic points: the body cap must not reject what the field cap allows."""
    assert limits.MAX_GPS_POINTS >= 2_100
    payload = json.loads((DISPUTES / "route_deviation_001.json").read_text())
    payload["gps_points"] = [
        {"lat": 1.352083, "lng": 103.819836, "timestamp": "2026-09-22T22:40:00+08:00"}
    ] * limits.MAX_GPS_POINTS
    assert len(json.dumps(payload).encode()) <= limits.MAX_BODY_BYTES
    assert client.post("/api/disputes/resolve", json=payload).status_code == 200
