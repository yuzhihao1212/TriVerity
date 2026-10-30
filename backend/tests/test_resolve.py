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

@pytest.mark.parametrize(("expected_min", "actual_min"), [(20, None), (None, 30), (None, None)])
def test_longer_route_without_duration_needs_review(expected_min, actual_min):
    # RD-3 needs the route to have taken longer too, and missing data doesn't show that.
    payload = load("route_deviation_001.json")
    payload["trip"] |= {"expected_distance_km": 10, "actual_distance_km": 14,
                        "expected_duration_min": expected_min, "actual_duration_min": actual_min}
    result = resolve(payload)
    assert result["decision"] == "needs_review"
    assert result["refund_amount"] is None
    assert [ref.split(":")[0] for ref in result["policy_refs"]] == ["RD-4"]
    assert "$" not in result["recommended_action"]
    # The rider sees why, as with any other missing trip data, and no proposed outcome.
    assert "trip duration" in result["rider_explanation"]
    assert not any(check["rule"] == "RD-3" for check in result["conditions"])

def test_within_tolerance_route_needs_no_duration():
    payload = load("route_deviation_002.json")
    payload["trip"]["actual_duration_min"] = None
    result = resolve(payload)
    assert result["decision"] == "no_action"
    assert result["policy_refs"][0].startswith("RD-1:")

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
        "evidence_loader", "evidence_collector", "fraud_detector", "rider_advocate", "driver_advocate",
        "rider_rebuttal", "driver_rebuttal", "precedent_agent", "judge",
    ]

def test_invalid_dispute_type_rejected():
    payload = load("route_deviation_001.json")
    payload["type"] = "lost_item"
    assert client.post("/api/disputes/resolve", json=payload).status_code == 422

def test_threat_in_chat_escalates_to_human_review():
    result = resolve(load("route_deviation_004.json"))
    assert result["decision"] == "needs_review"
    assert any(ref.startswith("SAFE-1:") for ref in result["policy_refs"])
    # The fare ruling is kept as the proposal for the reviewer.
    assert "RD-3" in " ".join(result["policy_refs"])
    assert any("regret" in e for e in result["judge_evidence"])

def test_chat_analysis_flags_agreement_and_disagreement():
    evidence = " ".join(resolve(load("route_deviation_001.json"))["judge_evidence"])
    assert 'Disagreement in chat: rider: "Why are we going this way?' in evidence
    evidence = " ".join(resolve(load("no_show_003.json"))["judge_evidence"])
    assert 'Agreement in chat: rider: "Ok, 5 more minutes."' in evidence

def test_fare_breakdown_checked_against_charge():
    evidence = resolve(load("route_deviation_001.json"))["judge_evidence"]
    assert "Fare breakdown matches the charged fare" in evidence
    evidence = resolve(load("route_deviation_004.json"))["judge_evidence"]
    assert "Surge pricing applied: x1.2" in evidence
    assert "Promo code RYDE10 applied (1.50 off)" in evidence
    assert "Fare breakdown matches the charged fare" in evidence  # 23.40 itemised - 1.50 promo

def test_fare_breakdown_mismatch_reported():
    payload = load("route_deviation_001.json")
    payload["fare"]["actual"] = 26.80
    evidence = resolve(payload)["judge_evidence"]
    assert "Charged fare is +2.00 vs the itemised breakdown" in evidence

def test_history_included_in_evidence():
    evidence = resolve(load("route_deviation_001.json"))["judge_evidence"]
    assert "Driver history: account 1460 days old, rating 4.7, 3890 trips, 2 disputes in last 90 days" in evidence

@pytest.mark.parametrize("sample", sorted(p.name for p in DISPUTES.glob("*.json")))
def test_every_ruling_is_explained_to_both_parties(sample):
    result = resolve(load(sample))
    assert result["rider_explanation"].startswith("Hi there, thanks for getting in touch")
    assert result["driver_explanation"].startswith("Hi there, thanks for your patience")
    for party in ("rider", "driver"):
        parts = result[f"{party}_message"]
        assert all(parts[key] for key in ("greeting", "found", "next"))

def test_refund_explanation_states_amount():
    result = resolve(load("route_deviation_001.json"))
    assert "you're getting $6.30 back." in result["rider_explanation"]
    assert "$6.30" in result["driver_explanation"]

def test_unknown_history_fields_are_accepted():
    payload = load("no_show_001.json")
    payload["rider_history"]["cancellation_rate"] = 0.4
    assert resolve(payload)["decision"] == "needs_review"

def test_samples_endpoint_lists_every_sample():
    response = client.get("/api/disputes/samples")
    assert response.status_code == 200
    ids = [case["dispute_id"] for case in response.json()]
    organiser = DISPUTES.parent / "organiser"
    assert len(ids) == len(list(DISPUTES.glob("*.json"))) + len(list(organiser.glob("*.json")))
    assert ids == sorted(ids)
