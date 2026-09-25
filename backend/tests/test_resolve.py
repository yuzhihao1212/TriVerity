import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
DISPUTES = Path(__file__).resolve().parents[2] / "data" / "disputes"

def resolve(payload: dict) -> dict:
    response = client.post("/api/disputes/resolve", json=payload)
    assert response.status_code == 200, response.text
    return response.json()

def load(name: str) -> dict:
    return json.loads((DISPUTES / name).read_text())

@pytest.mark.parametrize(
    ("sample", "decision", "rule", "refund"),
    [
        ("route_deviation_001.json", "partial_refund", "RD-3", 6.30),  # longer and slower
        ("route_deviation_002.json", "no_action", "RD-1", None),       # within tolerance
        ("route_deviation_003.json", "no_action", "RD-2", None),       # longer but faster
        ("no_show_001.json", "needs_review", "NS-4", None),            # wait time missing
        ("no_show_002.json", "full_refund", "NS-1", 4.0),              # driver ~380 m away
        ("no_show_003.json", "no_action", "NS-3", None),               # all conditions met
    ],
)
def test_sample_rulings(sample, decision, rule, refund):
    result = resolve(load(sample))
    assert result["decision"] == decision
    assert any(ref.startswith(f"{rule}:") for ref in result["policy_refs"])
    assert result["refund_amount"] == pytest.approx(refund)

def test_route_deviation_without_distance_needs_review():
    payload = load("route_deviation_001.json")
    payload["trip"]["actual_distance_km"] = None
    assert resolve(payload)["decision"] == "needs_review"

def test_short_wait_refunds_no_show_fee():
    payload = load("no_show_003.json")
    payload["trip"]["driver_wait_min"] = 2
    result = resolve(payload)
    assert result["decision"] == "full_refund"
    assert any(ref.startswith("NS-2:") for ref in result["policy_refs"])

def test_no_contact_attempt_refunds_no_show_fee():
    payload = load("no_show_003.json")
    payload["chat_logs"] = [{"sender": "rider", "message": "Where are you?"}]
    assert resolve(payload)["decision"] == "full_refund"

def test_response_includes_both_advocates_and_log():
    result = resolve(load("route_deviation_001.json"))
    assert result["rider_case"]["agent"] == "rider_advocate"
    assert result["driver_case"]["agent"] == "driver_advocate"
    assert [e["agent"] for e in result["agent_log"]] == [
        "evidence_loader", "rider_advocate", "driver_advocate", "judge",
    ]

def test_invalid_dispute_type_rejected():
    payload = load("route_deviation_001.json")
    payload["type"] = "lost_item"
    assert client.post("/api/disputes/resolve", json=payload).status_code == 422
