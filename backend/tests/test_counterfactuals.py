"""Counterfactuals: every "if X, the outcome would be Y" is checked by changing X and re-running the rules."""

import json
from itertools import product

import pytest
from fastapi.testclient import TestClient

from app.agents.judge_agent import base_ruling
from app.main import create_app
from app.models.dispute import DisputeCase
from app.models.resolution import PartyResolution, Ruling
from app.services.counterfactuals import what_would_change
from app.services.evidence import CaseFacts
from app.services.orchestrator import resolve_dispute
from app.services.sample_service import load_samples

SAMPLES = {c.dispute_id: c for c in load_samples()}
LIMIT, MAX_M, MIN_WAIT = 0.15, 100, 5


def case(dispute_type: str) -> DisputeCase:
    return DisputeCase(dispute_id="CF-1", type=dispute_type, rider_claim="x", fare={"cancellation_fee": 5.0})


def apply(cf, facts: CaseFacts) -> CaseFacts:
    """Make the change a counterfactual describes, independently of how it was worded."""
    f = facts.model_copy()
    for rule in cf.rules:
        if cf.decision == "no_action":       # the conditions that would make the charge stand
            if rule == "RD-1":
                f.distance_excess_ratio = LIMIT
            elif rule == "RD-2":
                f.duration_excess_ratio = 0.0
            elif rule == "NS-1" and (f.driver_distance_from_pickup_m is None or f.driver_distance_from_pickup_m > MAX_M):
                f.driver_distance_from_pickup_m = MAX_M
            elif rule == "NS-2" and (f.driver_wait_min is None or f.driver_wait_min < MIN_WAIT):
                f.driver_wait_min = MIN_WAIT
            elif rule == "NS-3":
                f.driver_contact_attempted = True
        elif cf.decision in ("partial_refund", "full_refund"):
            if rule == "RD-3":
                f.distance_excess_ratio = max(f.distance_excess_ratio, LIMIT + 0.01)
                f.duration_excess_ratio = max(f.duration_excess_ratio, 0.01)
            elif rule == "NS-1":
                f.driver_distance_from_pickup_m = MAX_M + 1
            elif rule == "NS-2":
                f.driver_wait_min = MIN_WAIT - 0.1
            elif rule == "NS-3":
                f.driver_contact_attempted = False
    return f


ROUTE = [CaseFacts(distance_excess_ratio=e, duration_excess_ratio=d, fare_difference=3.0)
         for e, d in product([0.0, 0.08, 0.15, 0.16, 0.44], [-0.2, 0.0, 0.05, 0.59])]
NO_SHOW = [CaseFacts(driver_distance_from_pickup_m=m, driver_wait_min=w, driver_contact_attempted=c)
           for m, w, c in product([0, 100, 101, 378], [2, 4.9, 5, 8], [True, False])]


@pytest.mark.parametrize("dispute_type,facts", [("route_deviation", f) for f in ROUTE]
                         + [("no_show_charge", f) for f in NO_SHOW])
def test_every_counterfactual_really_changes_the_ruling(dispute_type, facts):
    c = case(dispute_type)
    ruling = base_ruling(c, facts)
    cfs = what_would_change(c, facts, ruling)
    assert cfs, "every automatic ruling explains what would change it"
    for cf in cfs:
        assert cf.decision != ruling.decision
        assert base_ruling(c, apply(cf, facts)).decision == cf.decision, cf.change


@pytest.mark.parametrize("facts,missing", [
    (CaseFacts(), "route"),
    (CaseFacts(driver_distance_from_pickup_m=87), "waiting time"),
    (CaseFacts(driver_wait_min=6), "arrival location"),
])
def test_missing_data_says_what_to_record(facts, missing):
    dispute_type = "route_deviation" if missing == "route" else "no_show_charge"
    c = case(dispute_type)
    cfs = what_would_change(c, facts, base_ruling(c, facts))
    assert len(cfs) == 1 and cfs[0].decision is None
    assert ("distance" if missing == "route" else missing) in cfs[0].change


def test_escalations_say_what_the_rules_alone_would_decide():
    result = resolve_dispute(SAMPLES["D007"])             # threat + high bad-faith risk on top of RD-3
    first = result.counterfactuals[0]
    assert "no threatening message" in first.change and "bad-faith" in first.change
    assert (first.decision, first.rules) == ("partial_refund", ["RD-3"])
    assert all(cf.outcome.endswith("for a human reviewer to confirm") for cf in result.counterfactuals[1:])


def test_sample_wording():
    d001 = [cf.change for cf in resolve_dispute(SAMPLES["D001"]).counterfactuals]
    assert d001 == ["the route had been at most 15% longer than expected (it was 44% longer)",
                    "the trip had taken no longer than expected (it was 59% slower)",
                    "the unexpected stop had lasted 10 minutes or more (it lasted 6)"]
    d005 = resolve_dispute(SAMPLES["D005"]).counterfactuals
    assert [(cf.change, cf.decision) for cf in d005] == [
        ("the driver had stopped within 100 m of the pickup point (they stopped 378 m away)", "no_action")]


def test_counterfactuals_stay_out_of_party_views():
    client = TestClient(create_app())
    body = SAMPLES["D001"].model_dump()
    assert client.post("/api/disputes/resolve", json=body).json()["counterfactuals"]
    for view in ("rider", "driver"):
        party = client.post(f"/api/disputes/resolve?view={view}", json=body).json()
        assert set(party) == set(PartyResolution.model_fields)
        assert "would be" not in json.dumps(party)
