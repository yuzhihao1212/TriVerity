"""The organisers' RydeResolve dataset converts into a DisputeCase and resolves as expected."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.evidence import compute_facts
from app.services.ryde_adapter import to_dispute_case

ORGANISER = Path(__file__).resolve().parents[2] / "data" / "organiser"
client = TestClient(app)

# Expected rulings as stated by the organisers alongside each case.
EXPECTED = {"disp_002.json": "no_action"}  # "Cancellation charge UPHELD"

def raw(name: str) -> dict:
    return json.loads((ORGANISER / name).read_text())

def test_every_organiser_case_has_an_expected_ruling():
    assert {p.name for p in ORGANISER.glob("*.json")} == set(EXPECTED)

@pytest.mark.parametrize(("name", "decision"), EXPECTED.items())
def test_organiser_case_resolves_to_expected_ruling(name, decision):
    case = to_dispute_case(raw(name))
    response = client.post("/api/disputes/resolve", json=case.model_dump())
    assert response.status_code == 200, response.text
    assert response.json()["decision"] == decision

def test_disp_002_facts():
    case = to_dispute_case(raw("disp_002.json"))
    facts = compute_facts(case)
    assert facts.driver_distance_from_pickup_m == 0
    assert facts.driver_wait_min == 8
    assert facts.driver_contact_attempted
    assert not facts.chat.threats
    assert case.fare.cancellation_fee == 5.0
    # Lifetime dispute counts are not a 90-day count, so they are not mapped.
    assert case.rider_history.disputes_last_90d is None
    assert any(m.message.startswith("[call]") for m in case.chat_logs)
    assert any(m.message.startswith("[app event] driver_arrived") for m in case.chat_logs)
