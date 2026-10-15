"""Triage orders escalated disputes for reviewers and never reaches the rider or driver."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.resolution import Ruling
from app.services.triage import triage

client = TestClient(app)
DISPUTES = Path(__file__).resolve().parents[2] / "data" / "disputes"
POLICY_TEXT = {
    "SAFE-1": "SAFE-1: x", "FRAUD-1": "FRAUD-1: x", "NS-4": "NS-4: x", "ESC-1": "ESC-1: x", "RD-3": "RD-3: x",
}

def ruling(decision="needs_review", refs=(), refund=None, confidence=0.8) -> Ruling:
    return Ruling(decision=decision, recommended_action="", refund_amount=refund, confidence=confidence,
                  explanation="", policy_refs=[POLICY_TEXT[r] for r in refs])

def resolve(name: str, view: str = "internal") -> dict:
    payload = json.loads((DISPUTES / name).read_text())
    response = client.post(f"/api/disputes/resolve?view={view}", json=payload)
    assert response.status_code == 200, response.text
    return response.json()

def test_auto_resolved_case_needs_no_review():
    t = triage(ruling("partial_refund", ["RD-3"], refund=6.3))
    assert t.tier is None and t.score == 0 and t.reasons == []

def test_safety_wins_over_fraud_and_scores_highest():
    safety = triage(ruling(refs=["RD-3", "SAFE-1", "FRAUD-1"], refund=6.9))
    fraud = triage(ruling(refs=["RD-3", "FRAUD-1"], refund=6.3))
    assert safety.tier == "safety" and fraud.tier == "high"
    assert safety.score > fraud.score
    assert "Threatening message in chat (SAFE-1)" in safety.reasons

def test_missing_evidence_with_low_confidence_is_standard():
    t = triage(ruling(refs=["NS-4"], confidence=0.4))
    assert t.tier == "standard"
    assert t.score == 30  # NS-4 (10) + 20 points below the 60% threshold
    assert t.reasons == ["Arrival or waiting evidence missing (NS-4)", "Confidence 40%"]

def test_small_proposed_refund_is_low():
    assert triage(ruling(refs=["ESC-1"], refund=3.0, confidence=0.5)).tier == "low"
    # A threat is never demoted, however small the amount.
    assert triage(ruling(refs=["SAFE-1"], refund=1.0)).tier == "safety"

def test_score_is_capped_at_100():
    assert triage(ruling(refs=["SAFE-1", "FRAUD-1", "ESC-1"], refund=500.0, confidence=0.1)).score == 100

@pytest.mark.parametrize(("sample", "tier"), [
    ("route_deviation_001.json", None),
    ("no_show_001.json", "standard"),
    ("route_deviation_004.json", "safety"),
    ("route_deviation_005.json", "high"),
])
def test_samples_are_triaged_in_the_internal_view(sample, tier):
    result = resolve(sample)
    assert result["triage"]["tier"] == tier

@pytest.mark.parametrize("view", ["rider", "driver"])
def test_triage_never_reaches_the_parties(view):
    body = json.dumps(resolve("route_deviation_004.json", view))  # D007: safety + fraud
    assert "triage" not in body
    for leak in ("safety", "SAFE-1", "FRAUD-1", "bad-faith", "score"):
        assert leak not in body, leak
