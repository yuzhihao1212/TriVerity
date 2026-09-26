"""Tests for the Fraud & Bad-Faith Detection agent and FRAUD-1 escalation.

All scoring is deterministic — no LLM, no network — so these tests run without
any API key.
"""

import json
from pathlib import Path

import pytest

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


# -- _escalate should not wrap an already-escalated action twice -------------

def test_escalate_does_not_wrap_twice_d007():
    """D007 has both a safety threat (SAFE-1) and driver high risk (FRAUD-1).

    The recommended_action should wrap the original proposed action only once,
    not nest "Escalate … (proposed: Escalate … (proposed: …))".
    """
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    payload = json.loads((DATA_ROOT / "route_deviation_004.json").read_text())
    result = client.post("/api/disputes/resolve", json=payload).json()

    assert result["decision"] == "needs_review"
    refs = " ".join(result["policy_refs"])
    assert "SAFE-1" in refs
    assert "FRAUD-1" in refs
    # The action must be wrapped at most once — no nested "(proposed: Escalate".
    assert result["recommended_action"].count("(proposed:") <= 1


# -- Fraud signals must not appear in party messages -------------------------

def test_party_messages_no_fraud_or_history_d008():
    """D008 (rider high risk): party messages must not mention fraud, bad-faith
    or the party's account/dispute history. The narration LLM is mocked to try
    to leak these terms, and must be rejected back to the safe template."""
    from app.agents import judge_narration
    from fastapi.testclient import TestClient
    from app.main import app

    leaked = json.dumps({
        "explanation": "The rider shows high fraud risk with a bad-faith dispute history.",
        "rider_explanation": "Your account history shows fraud and bad-faith disputes in the last 90 days.",
        "driver_explanation": "The rider has a fraud and bad faith history.",
    })

    import app.services.llm_client as llm_client
    original = llm_client.complete
    llm_client.complete = lambda system, user: leaked
    judge_narration.complete = leaked  # the narration module imports by name
    try:
        client = TestClient(app)
        payload = json.loads((DATA_ROOT / "route_deviation_005.json").read_text())
        result = client.post("/api/disputes/resolve", json=payload).json()
    finally:
        llm_client.complete = original
        judge_narration.complete = original

    rider_msg = result["rider_explanation"].lower()
    driver_msg = result["driver_explanation"].lower()
    for term in ("fraud", "bad-faith", "bad faith", "history", "disputes in"):
        assert term not in rider_msg, f"rider message leaks '{term}': {result['rider_explanation']}"
        assert term not in driver_msg, f"driver message leaks '{term}': {result['driver_explanation']}"


# -- _apply_fraud names both parties when both are high risk -----------------

def test_apply_fraud_names_both_parties_when_both_high():
    """When both rider and driver are high risk, the explanation mentions both."""
    from app.agents.fraud_agent import assess_risk
    from app.agents.judge_agent import _apply_fraud, _judge_route_deviation
    from app.services.evidence import compute_facts
    from app.services.policy_service import load_policy

    payload = json.loads(json.dumps(BASE_CASE))
    # Rider: 2 signals (many disputes + low rating) → high
    payload["rider_history"]["disputes_last_90d"] = 5
    payload["rider_history"]["rating"] = 4.0
    # Driver: 2 signals (many disputes + low rating) → high
    payload["driver_history"]["disputes_last_90d"] = 4
    payload["driver_history"]["rating"] = 4.0

    case = _case(payload)
    facts = compute_facts(case)
    risk = assess_risk(case, facts)
    assert risk.rider_risk == "high"
    assert risk.driver_risk == "high"

    policy = load_policy()
    base = _judge_route_deviation(case, facts, policy["route_deviation"])
    escalated = _apply_fraud(base, risk, policy["fraud"])

    assert "rider and driver" in escalated.explanation.lower()


# -- new-account signal only fires when 3+ disputes signal didn't -----------

def test_new_account_signal_suppressed_when_many_disputes_fires():
    """When a party has 3+ disputes AND a new account, only the 3+ disputes
    signal should fire — not the new-account signal."""
    payload = json.loads(json.dumps(BASE_CASE))
    payload["rider_history"]["account_age_days"] = 10
    payload["rider_history"]["disputes_last_90d"] = 4
    risk = assess_risk(_case(payload), compute_facts(_case(payload)))

    many = [s for s in risk.signals if "4 disputes" in s]
    new_account = [s for s in risk.signals if "10 days old" in s]
    assert many, "3+ disputes signal should fire"
    assert not new_account, "new-account signal should be suppressed"


def test_new_account_signal_fires_when_no_many_disputes():
    """When the 3+ disputes signal does not fire, the new-account signal can."""
    payload = json.loads(json.dumps(BASE_CASE))
    payload["rider_history"]["account_age_days"] = 15
    payload["rider_history"]["disputes_last_90d"] = 1
    risk = assess_risk(_case(payload), compute_facts(_case(payload)))

    assert any("15 days old" in s for s in risk.signals)


# -- narration _check rejects party messages that mention fraud --------------

def test_narration_check_rejects_fraud_in_party_message():
    """The _check guard rejects rider/driver explanations that mention fraud."""
    from app.agents.judge_narration import _check
    from app.models.dispute import DisputeCase
    from app.models.resolution import Ruling

    case = _case(BASE_CASE)
    ruling = Ruling(
        decision="needs_review",
        recommended_action="Escalate to a human reviewer.",
        confidence=0.5,
        explanation="The rider shows a high bad-faith risk.",
        policy_refs=["FRAUD-1:1"],
    )
    texts = {
        "explanation": "The case is escalated for review.",
        "rider_explanation": "We found fraud in your account history.",
        "driver_explanation": "The rider's dispute is under review.",
    }
    problem = _check(texts, case, ruling)
    assert problem is not None
    assert "fraud" in problem.lower()


@pytest.mark.parametrize(
    ("rider", "driver", "expected"),
    [
        ("high", "low", "The rider shows a high bad-faith risk."),
        ("low", "high", "The driver shows a high bad-faith risk."),
        ("high", "high", "The rider and driver show a high bad-faith risk."),
    ],
)
def test_fraud_reason_grammar(rider, driver, expected):
    from app.agents.judge_agent import _apply_fraud
    from app.models.resolution import Ruling

    ruling = Ruling(decision="no_action", recommended_action="Uphold the fare.", confidence=0.85, explanation="Base.")
    risk = RiskAssessment(rider_risk=rider, driver_risk=driver)
    assert _apply_fraud(ruling, risk, load_policy()["fraud"]).explanation.startswith(expected)
