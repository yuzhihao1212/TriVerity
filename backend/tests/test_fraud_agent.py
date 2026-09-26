"""Tests for the Fraud & Bad-Faith Detection agent and FRAUD-1 escalation.

All scoring is deterministic — no LLM, no network — so these tests run without
any API key.
"""

import json
from pathlib import Path

from app.agents.fraud_agent import assess_risk
from app.models.dispute import DisputeCase
from app.models.resolution import RiskAssessment
from app.services.evidence import compute_facts
from app.services.policy_service import load_policy

DATA_ROOT = Path(__file__).resolve().parents[2] / "data" / "disputes"

BASE_CASE = {
    "dispute_id": "F1",
    "type": "route_deviation",
    "rider_claim": "The driver took a much longer route and I was overcharged.",
    "driver_statement": "I diverted because the normal road was congested.",
    "trip": {
        "expected_distance_km": 10.2,
        "actual_distance_km": 14.7,
        "expected_duration_min": 22,
        "actual_duration_min": 35,
    },
    "fare": {"expected": 18.5, "actual": 24.8},
    "chat_logs": [],
    "rider_history": {"account_age_days": 820, "rating": 4.8, "completed_trips": 214, "disputes_last_90d": 0},
    "driver_history": {"account_age_days": 1460, "rating": 4.7, "completed_trips": 3890, "disputes_last_90d": 2},
}

NO_SHOW_CASE = {
    "dispute_id": "F2",
    "type": "no_show_charge",
    "rider_claim": "The driver never arrived and I was charged a no-show fee.",
    "driver_statement": "I waited at the pickup point and messaged the rider, but they didn't come.",
    "trip": {
        "pickup_lat": 1.3521,
        "pickup_lng": 103.8198,
        "driver_arrival_lat": 1.3522,
        "driver_arrival_lng": 103.8199,
        "driver_wait_min": 7,
    },
    "fare": {"cancellation_fee": 4.0},
    "chat_logs": [{"sender": "driver", "message": "I've arrived at the pickup point."}],
    "rider_history": {"account_age_days": 500, "rating": 4.5, "completed_trips": 100, "disputes_last_90d": 0},
    "driver_history": {"account_age_days": 500, "rating": 4.5, "completed_trips": 100, "disputes_last_90d": 0},
}


def _case(payload: dict) -> DisputeCase:
    return DisputeCase(**payload)


# -- Individual signals -------------------------------------------------------

def test_signal_many_disputes():
    """3+ disputes in the last 90 days raises a signal."""
    payload = json.loads(json.dumps(BASE_CASE))
    payload["rider_history"]["disputes_last_90d"] = 4
    risk = assess_risk(_case(payload), compute_facts(_case(payload)))

    assert any("Rider" in s and "4 disputes" in s for s in risk.signals)
    assert risk.rider_risk == "medium"
    assert risk.driver_risk == "low"


def test_signal_new_account_with_disputes():
    """Account under 30 days old with any disputes raises a signal."""
    payload = json.loads(json.dumps(BASE_CASE))
    payload["rider_history"]["account_age_days"] = 15
    payload["rider_history"]["disputes_last_90d"] = 1
    risk = assess_risk(_case(payload), compute_facts(_case(payload)))

    assert any("15 days old" in s for s in risk.signals)
    assert risk.rider_risk == "medium"


def test_signal_low_rating():
    """Rating below 4.3 raises a signal."""
    payload = json.loads(json.dumps(BASE_CASE))
    payload["driver_history"]["rating"] = 4.0
    risk = assess_risk(_case(payload), compute_facts(_case(payload)))

    assert any("Driver" in s and "below 4.3" in s for s in risk.signals)
    assert risk.driver_risk == "medium"


def test_signal_rider_claim_contradicted_by_facts():
    """Rider says the driver never arrived, but facts show the driver was close and messaged."""
    payload = json.loads(json.dumps(NO_SHOW_CASE))
    # Rider claim already says "never arrived". Driver arrived ~11 m away and messaged.
    risk = assess_risk(_case(payload), compute_facts(_case(payload)))

    rider_contradiction = [s for s in risk.signals if "Rider claims the driver never arrived" in s]
    assert rider_contradiction
    assert risk.rider_risk == "medium"


def test_signal_driver_wait_contradicted():
    """Driver says they waited, but facts show wait < 5 min."""
    payload = json.loads(json.dumps(NO_SHOW_CASE))
    payload["trip"]["driver_wait_min"] = 3
    # Driver statement says "I waited" — contradicted by 3 min wait.
    risk = assess_risk(_case(payload), compute_facts(_case(payload)))

    assert any("Driver claims to have waited" in s for s in risk.signals)
    assert risk.driver_risk == "medium"


# -- Risk level aggregation ---------------------------------------------------

def test_two_signals_is_high():
    """Two or more signals for a party = high risk."""
    payload = json.loads(json.dumps(BASE_CASE))
    payload["rider_history"]["disputes_last_90d"] = 5   # signal 1
    payload["rider_history"]["rating"] = 4.0            # signal 2
    risk = assess_risk(_case(payload), compute_facts(_case(payload)))

    assert risk.rider_risk == "high"
    assert risk.driver_risk == "low"


def test_one_signal_is_medium():
    payload = json.loads(json.dumps(BASE_CASE))
    payload["rider_history"]["disputes_last_90d"] = 3
    risk = assess_risk(_case(payload), compute_facts(_case(payload)))

    assert risk.rider_risk == "medium"


def test_zero_signals_is_low():
    risk = assess_risk(_case(BASE_CASE), compute_facts(_case(BASE_CASE)))

    assert risk.rider_risk == "low"
    assert risk.driver_risk == "low"
    assert risk.signals == []
    assert "low risk" in risk.summary


# -- Low-risk case unchanged --------------------------------------------------

def test_low_risk_case_unchanged_by_fraud():
    """A clean dispute's ruling should not be escalated by FRAUD-1."""
    from app.agents.judge_agent import judge
    from app.agents._advocate import build_advocate_case
    from app.models.resolution import AgentCase

    case = _case(BASE_CASE)
    facts = compute_facts(case)
    policy = load_policy()
    section = policy[case.type]

    # Use deterministic advocate cases (no LLM).
    rider_case = AgentCase(
        agent="rider_advocate",
        summary="Rider disputes the charge",
        evidence=facts.describe(),
    )
    driver_case = AgentCase(
        agent="driver_advocate",
        summary="Driver's position",
        evidence=facts.describe(),
    )
    risk = assess_risk(case, facts)

    ruling = judge(case, facts, rider_case, driver_case, risk)

    assert ruling.decision != "needs_review" or "FRAUD-1" not in " ".join(ruling.policy_refs)
    assert not any("FRAUD-1" in ref for ref in ruling.policy_refs)


# -- FRAUD-1 escalation via the full pipeline --------------------------------

def test_fraud_1_escalation_high_risk_rider():
    """route_deviation_005: trip data gives a refund, but rider is high-risk → FRAUD-1 escalation."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    payload = json.loads((DATA_ROOT / "route_deviation_005.json").read_text())
    response = client.post("/api/disputes/resolve", json=payload)
    assert response.status_code == 200, response.text
    result = response.json()

    assert result["decision"] == "needs_review"
    assert any(ref.startswith("FRAUD-1:") for ref in result["policy_refs"])
    # The fare ruling is kept as the proposal for the reviewer.
    assert "RD-3" in " ".join(result["policy_refs"])
    assert result["risk"]["rider_risk"] == "high"


def test_fraud_1_does_not_change_refund_amount():
    """FRAUD-1 escalation must not change the refund amount."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    payload = json.loads((DATA_ROOT / "route_deviation_005.json").read_text())
    result = client.post("/api/disputes/resolve", json=payload).json()

    # The proposed refund (from RD-3) should still be 6.30.
    assert result["refund_amount"] is not None
    assert abs(result["refund_amount"] - 6.30) < 0.01


def test_resolution_includes_risk_assessment():
    """The Resolution includes a risk field with the RiskAssessment."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    payload = json.loads((DATA_ROOT / "route_deviation_001.json").read_text())
    result = client.post("/api/disputes/resolve", json=payload).json()

    assert "risk" in result
    assert result["risk"]["rider_risk"] in ("low", "medium", "high")
    assert result["risk"]["driver_risk"] in ("low", "medium", "high")
    assert isinstance(result["risk"]["signals"], list)
    assert result["risk"]["summary"]


def test_fraud_detector_in_agent_log():
    """The agent_log includes a fraud_detector step."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    payload = json.loads((DATA_ROOT / "route_deviation_001.json").read_text())
    result = client.post("/api/disputes/resolve", json=payload).json()

    agents = [e["agent"] for e in result["agent_log"]]
    assert "fraud_detector" in agents


# -- Driver high risk ---------------------------------------------------------

def test_high_risk_driver_escalates():
    """A driver with high bad-faith risk also triggers FRAUD-1."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    payload = json.loads((DATA_ROOT / "route_deviation_001.json").read_text())
    payload["driver_history"]["disputes_last_90d"] = 5
    payload["driver_history"]["rating"] = 4.0
    result = client.post("/api/disputes/resolve", json=payload).json()

    assert result["decision"] == "needs_review"
    assert any(ref.startswith("FRAUD-1:") for ref in result["policy_refs"])
    assert result["risk"]["driver_risk"] == "high"
