"""Party views of a resolution carry no internal data (finding F8, guide 3.4).

``?view=rider`` / ``?view=driver`` return only the decision, the refund actually
given and that party's message. The default stays the full internal view used by
the reviewer console.
"""

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
DISPUTES = Path(__file__).resolve().parents[2] / "data" / "disputes"
SAMPLES = sorted(p.name for p in DISPUTES.glob("*.json"))
RESOLVE = "/api/disputes/resolve"
PARTY_KEYS = {"dispute_id", "decision", "refund_amount", "message", "explanation_source"}
LEAK_WORDS = ("fraud", "bad faith", "bad-faith", "scam", "suspicious", "flagged", "history",
              "rating", "days old", "disputes in", "trips", "risk")
LEAKY_NARRATION = json.dumps({
    "explanation": "The rider shows a high bad-faith risk.",
    "rider_explanation": "Your dispute history and rating triggered a fraud review.",
    "driver_explanation": "The rider is flagged as suspicious, with several recent claims.",
})


def load(name: str) -> dict:
    return json.loads((DISPUTES / name).read_text())


def history_numbers(history: dict) -> list[str]:
    return [f"{history[k]} trips" for k in ("completed_trips",) if history.get(k) is not None] + \
           [f"{history[k]} days" for k in ("account_age_days",) if history.get(k) is not None]


@pytest.mark.parametrize("narration", ["offline", "leaky"])
@pytest.mark.parametrize("party", ["rider", "driver"])
@pytest.mark.parametrize("sample", SAMPLES)
def test_party_view_carries_no_internal_data(sample, party, narration):
    payload = load(sample)
    reply = (lambda *a, **k: LEAKY_NARRATION) if narration == "leaky" else None
    with patch("app.agents.judge_narration.complete", side_effect=reply) if reply else _nothing():
        response = client.post(f"{RESOLVE}?view={party}", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == PARTY_KEYS
    text = json.dumps(body).lower()
    assert not any(word in text for word in LEAK_WORDS), body["message"]
    other = "driver_history" if party == "rider" else "rider_history"
    for number in history_numbers(payload.get(other, {})):
        assert number not in text


@pytest.mark.parametrize(("party", "field"), [("rider", "rider_explanation"), ("driver", "driver_explanation")])
def test_party_gets_its_own_message(party, field):
    full = client.post(RESOLVE, json=load("route_deviation_001.json")).json()
    view = client.post(f"{RESOLVE}?view={party}", json=load("route_deviation_001.json")).json()
    assert view["message"] == full[field]
    assert view["decision"] == "partial_refund" and view["refund_amount"] == pytest.approx(6.30)


def test_escalated_case_shows_no_proposed_refund_to_parties():
    """On needs_review the refund is only a proposal for the reviewer, not a promise."""
    full = client.post(RESOLVE, json=load("route_deviation_004.json")).json()
    view = client.post(f"{RESOLVE}?view=rider", json=load("route_deviation_004.json")).json()
    assert full["decision"] == "needs_review" and full["refund_amount"] == pytest.approx(6.90)
    assert view["refund_amount"] is None


def test_default_view_is_unchanged_internal_resolution():
    body = client.post(RESOLVE, json=load("route_deviation_005.json")).json()
    assert {"risk", "judge_evidence", "agent_log", "rider_case", "driver_case", "explanation"} <= set(body)


def test_unknown_view_rejected():
    assert client.post(f"{RESOLVE}?view=admin", json=load("route_deviation_001.json")).status_code == 422


class _nothing:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False
