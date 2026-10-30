"""Auto-resolve eligibility: routine rulings can skip the human reviewer.

All scoring is deterministic — no LLM, no network — so these tests run without
any API key. Autonomy is internal, like triage: it never reaches the rider or
driver.
"""

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.dispute import DisputeCase
from app.models.resolution import Ruling
from app.services.autonomy import auto_resolve, _is_audit_sample
from app.services.policy_service import load_policy

client = TestClient(app)
DISPUTES = Path(__file__).resolve().parents[2] / "data" / "disputes"
POLICY_TEXT = {
    "RD-1": "RD-1: x", "RD-2": "RD-2: x", "RD-3": "RD-3: x", "RD-4": "RD-4: x",
    "NS-1": "NS-1: x", "NS-2": "NS-2: x", "NS-3": "NS-3: x", "NS-4": "NS-4: x",
    "SAFE-1": "SAFE-1: x", "FRAUD-1": "FRAUD-1: x", "ESC-1": "ESC-1: x", "PREC-1": "PREC-1: x",
}


def load(name: str) -> dict:
    return json.loads((DISPUTES / name).read_text())


def case(name: str) -> DisputeCase:
    return DisputeCase(**load(name))


def ruling(decision="partial_refund", refs=("RD-3",), refund=6.30, confidence=0.85) -> Ruling:
    return Ruling(
        decision=decision, recommended_action="", refund_amount=refund,
        confidence=confidence, explanation="", policy_refs=[POLICY_TEXT[r] for r in refs],
    )


# -- Policy invariant --------------------------------------------------------

def test_auto_resolve_confidence_above_escalation_threshold():
    """min_confidence must stay above escalation.thresholds.min_confidence (0.6)."""
    policy = load_policy()
    auto = policy["auto_resolve"]["thresholds"]["min_confidence"]
    esc = policy["escalation"]["thresholds"]["min_confidence"]
    assert auto > esc, f"auto_resolve min_confidence ({auto}) must be above escalation ({esc})"


def test_policy_section_has_expected_fields():
    section = load_policy()["auto_resolve"]
    assert section["enabled"] is True
    assert section["thresholds"]["min_confidence"] == 0.8
    assert section["thresholds"]["max_refund"] == 10.0
    assert section["thresholds"]["audit_rate"] == 0.1


# -- One test per eligibility rule ------------------------------------------

def test_eligible_when_all_conditions_met():
    """D001: partial_refund, RD-3, $6.30, 85% confidence — eligible (not audit unless sampled)."""
    c = case("route_deviation_001.json")
    r = ruling()
    a = auto_resolve(r, c)
    assert a.eligible is True
    # The reasons say why it qualified, with this case's numbers.
    assert "Confidence 85% (at least 80%)" in a.reasons
    assert "$6.30 refund (at most $10.00)" in a.reasons


def test_not_eligible_when_disabled():
    """When enabled is false, nothing is eligible — the demo fallback."""
    c = case("route_deviation_001.json")
    r = ruling()
    policy = load_policy()
    disabled = {**policy, "auto_resolve": {**policy["auto_resolve"], "enabled": False}}
    with patch("app.services.autonomy.load_policy", return_value=disabled):
        a = auto_resolve(r, c)
    assert a.eligible is False
    assert "turned off" in a.reasons[0].lower()


def test_not_eligible_when_escalated():
    """needs_review is never auto-resolved."""
    c = case("route_deviation_001.json")
    r = ruling(decision="needs_review", refs=("RD-3", "ESC-1"))
    a = auto_resolve(r, c)
    assert a.eligible is False
    assert any("escalated" in reason.lower() for reason in a.reasons)


def test_not_eligible_when_confidence_below_min():
    """Confidence below 0.8 is not eligible."""
    c = case("route_deviation_001.json")
    r = ruling(confidence=0.7)
    a = auto_resolve(r, c)
    assert a.eligible is False
    assert any("confidence" in reason.lower() for reason in a.reasons)


def test_not_eligible_when_refund_exceeds_cap():
    """A refund above min(max_refund, fare) is not eligible."""
    c = case("route_deviation_001.json")  # fare.actual = 24.80, so cap = min(10, 24.80) = 10
    r = ruling(refund=12.0)
    a = auto_resolve(r, c)
    assert a.eligible is False
    assert any("cap" in reason.lower() for reason in a.reasons)


def test_not_eligible_when_refund_exceeds_fare_below_max():
    """When the fare is below max_refund, the cap is the fare itself."""
    c = case("no_show_002.json")  # fare.actual = null, cancellation_fee = 4.0 → cap = min(10, 4) = 4
    r = ruling(decision="full_refund", refs=("NS-1",), refund=4.0, confidence=0.85)
    # $4.00 == cap, so it's eligible
    a = auto_resolve(r, c)
    assert a.eligible is True
    # Now push it over
    r2 = ruling(decision="full_refund", refs=("NS-1",), refund=5.0, confidence=0.85)
    a2 = auto_resolve(r2, c)
    assert a2.eligible is False


@pytest.mark.parametrize("rule", ["SAFE-1", "FRAUD-1", "PREC-1", "ESC-1", "RD-4", "NS-4"])
def test_not_eligible_when_human_only_rule_cited(rule):
    """Any human-only rule in the cited rules blocks auto-resolve."""
    c = case("route_deviation_001.json")
    r = ruling(refs=("RD-3", rule))
    a = auto_resolve(r, c)
    assert a.eligible is False
    assert any(rule in reason for reason in a.reasons)


# -- Safety case D007 is never eligible -------------------------------------

def test_d007_safety_never_eligible():
    """D007 (route_deviation_004) has a threat (SAFE-1) and fraud — never auto-resolved."""
    payload = load("route_deviation_004.json")
    response = client.post("/api/disputes/resolve", json=payload)
    assert response.status_code == 200
    result = response.json()
    assert result["decision"] == "needs_review"
    assert result["autonomy"]["eligible"] is False
    assert any("SAFE-1" in r for r in result["autonomy"]["reasons"])


# -- Escalated case never eligible ------------------------------------------

def test_d008_escalated_never_eligible():
    """D008 (route_deviation_005) is escalated for fraud — never auto-resolved."""
    payload = load("route_deviation_005.json")
    result = client.post("/api/disputes/resolve", json=payload).json()
    assert result["decision"] == "needs_review"
    assert result["autonomy"]["eligible"] is False


# -- Audit sample is stable across runs -------------------------------------

def test_audit_sample_is_stable():
    """The same dispute id always gets the same audit answer."""
    for dispute_id in ("D001", "D003", "D005", "D006", "D007", "D008"):
        first = _is_audit_sample(dispute_id, 0.1)
        second = _is_audit_sample(dispute_id, 0.1)
        assert first == second, f"{dispute_id} audit answer changed between runs"


def test_audit_rate_zero_means_no_audit():
    assert _is_audit_sample("D001", 0.0) is False


def test_audit_rate_one_means_always_audit():
    assert _is_audit_sample("D001", 1.0) is True


def test_audited_case_is_eligible_but_audited():
    """An audited case is eligible=True, audit=True — it still goes to a human."""
    c = case("route_deviation_001.json")
    r = ruling()
    # Force audit by setting rate to 1.0
    policy = load_policy()
    always_audit = {**policy, "auto_resolve": {**policy["auto_resolve"],
        "thresholds": {**policy["auto_resolve"]["thresholds"], "audit_rate": 1.0}}}
    with patch("app.services.autonomy.load_policy", return_value=always_audit):
        a = auto_resolve(r, c)
    assert a.eligible is True
    assert a.audit is True
    assert "audit" in a.reasons[0].lower()


# -- Party view never carries autonomy --------------------------------------

@pytest.mark.parametrize("view", ["rider", "driver"])
def test_autonomy_never_reaches_parties(view):
    body = json.dumps(client.post(f"/api/disputes/resolve?view={view}", json=load("route_deviation_001.json")).json())
    assert "autonomy" not in body
    assert "auto_resolve" not in body
    assert "eligible" not in body


def test_internal_view_includes_autonomy():
    result = client.post("/api/disputes/resolve", json=load("route_deviation_001.json")).json()
    assert "autonomy" in result
    assert "eligible" in result["autonomy"]
    assert "audit" in result["autonomy"]
    assert isinstance(result["autonomy"]["reasons"], list)


# -- Full sample run: report actual counts ----------------------------------

@pytest.mark.parametrize("sample", sorted(p.name for p in DISPUTES.glob("*.json")))
def test_sample_autonomy_results(sample):
    """Every sample: report its eligibility for the PR summary (no assertion on count)."""
    result = client.post("/api/disputes/resolve", json=load(sample)).json()
    # Just verify the structure is valid; the actual counts are reported separately.
    assert "autonomy" in result
    assert result["autonomy"]["eligible"] in (True, False)
    assert result["autonomy"]["audit"] in (True, False)
