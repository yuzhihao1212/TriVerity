"""How the Judge weighed each side: cited rules checked against the facts."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models.resolution import AgentCase, PartyResolution
from app.services.argument_review import review_arguments, rule_support
from app.services.evidence import compute_facts
from app.services.orchestrator import resolve_dispute
from app.services.policy_service import cite, load_policy
from app.services.sample_service import load_samples

SAMPLES = {c.dispute_id: c for c in load_samples()}
EXPECTED = json.loads((Path(__file__).resolve().parents[2] / "data" / "expected_rulings.json").read_text())


@pytest.mark.parametrize("dispute_id", sorted(SAMPLES))
def test_rule_support_matches_the_hand_written_labels(dispute_id):
    support = rule_support(SAMPLES[dispute_id], compute_facts(SAMPLES[dispute_id]))
    for party in ("rider", "driver"):
        assert sorted(r for r, side in support.items() if side == party) == sorted(EXPECTED[dispute_id]["supports"][party])


def advocate(party, *rules, ids=("TRIP-1",)):
    section = load_policy()["route_deviation" if rules and rules[0].startswith("RD") else "no_show_charge"]
    return AgentCase(agent=f"{party}_advocate", summary="x", source="llm", evidence_ids=list(ids),
                     policy_refs=[cite(section, r) for r in rules])


def review(dispute_id, rider, driver):
    case = SAMPLES[dispute_id]
    facts = compute_facts(case)
    ruling = resolve_dispute(case)
    return {r.party: r for r in review_arguments(case, facts, ruling, rider, driver)}


def test_decisive_supporting_and_inapplicable_rules_on_d001():
    result = review("D001", advocate("rider", "RD-3", ids=("TRIP-1", "GPS-2")), advocate("driver", "RD-1"))
    rider, driver = result["rider"], result["driver"]
    assert [(c.rule, c.verdict, c.decisive) for c in rider.rules] == [("RD-3", "supports", True)]
    assert [(c.rule, c.verdict, c.decisive) for c in driver.rules] == [("RD-1", "does_not_apply", False)]
    assert rider.summary == "Rider: RD-3 holds in the rider's favour, and RD-3 decided the case (2 verified facts cited)."
    assert driver.summary == "Driver: RD-1 does not apply here (1 verified fact cited)."


def test_a_rule_that_favours_the_other_side_is_called_out_on_d005():
    result = review("D005", advocate("rider", "NS-1"), advocate("driver", "NS-1", "NS-2"))
    assert [(c.rule, c.verdict) for c in result["driver"].rules] == [("NS-1", "favours_other_side"), ("NS-2", "supports")]
    assert result["rider"].rules[0].decisive


def test_no_rule_cited_means_arguing_from_the_facts():
    result = review("D003", advocate("rider"), advocate("driver", "RD-1"))
    assert result["rider"].summary.startswith("Rider: no policy rule cited")
    assert result["driver"].rules[0].decisive


def test_every_resolution_carries_a_review_for_both_sides_and_parties_never_see_it():
    client = TestClient(create_app())
    body = SAMPLES["D001"].model_dump()
    internal = client.post("/api/disputes/resolve", json=body).json()
    assert [r["party"] for r in internal["argument_review"]] == ["rider", "driver"]
    for view in ("rider", "driver"):
        assert set(client.post(f"/api/disputes/resolve?view={view}", json=body).json()) == set(PartyResolution.model_fields)
