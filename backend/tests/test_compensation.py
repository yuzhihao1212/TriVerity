"""RD-5: an unjustified detour with a long unexpected stop earns the fare refund plus a credit."""

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from app.agents.judge_agent import base_ruling
from app.agents.precedent_agent import check_consistency
from app.models.dispute import DisputeCase
from app.models.resolution import PrecedentMatch, PrecedentReport
from app.services.argument_review import rule_support
from app.services.counterfactuals import what_would_change
from app.services.evidence import CaseFacts
from app.services.gps_analysis import GpsAnalysis, GpsStop
from app.services.orchestrator import resolve_dispute
from app.services.sample_service import load_samples

CASE = DisputeCase(dispute_id="C-1", type="route_deviation", rider_claim="Long detour and a long stop.")


def facts(stop_min=None, excess=0.44, slower=0.59):
    stops = [GpsStop(start_time=datetime(2026, 9, 20, 8, 14, tzinfo=timezone.utc), duration_min=stop_min,
                     lat=1.35, lng=103.88)] if stop_min else []
    return CaseFacts(dispute_type="route_deviation", distance_excess_ratio=excess, duration_excess_ratio=slower,
                     fare_difference=6.30, gps=GpsAnalysis(unexpected_stops=stops))


@pytest.mark.parametrize("stop,decision,amount,rules", [
    (None, "partial_refund", 6.30, ["RD-3"]),
    (6, "partial_refund", 6.30, ["RD-3"]),
    (9.9, "partial_refund", 6.30, ["RD-3"]),
    (10, "compensation", 11.30, ["RD-3", "RD-5"]),
    (14, "compensation", 11.30, ["RD-3", "RD-5"]),
])
def test_a_long_stop_on_a_detour_turns_the_refund_into_compensation(stop, decision, amount, rules):
    ruling = base_ruling(CASE, facts(stop))
    assert (ruling.decision, ruling.refund_amount, [r.split(":")[0] for r in ruling.policy_refs]) == (decision, amount, rules)


def test_no_compensation_without_an_unjustified_detour():
    assert base_ruling(CASE, facts(14, excess=0.08)).decision == "no_action"   # RD-1
    assert base_ruling(CASE, facts(14, slower=-0.1)).decision == "no_action"   # RD-2


def test_counterfactuals_flip_both_ways_and_hold():
    comp = what_would_change(CASE, facts(14), base_ruling(CASE, facts(14)))
    assert any(cf.decision == "partial_refund" and cf.rules == ["RD-3"] for cf in comp)
    assert base_ruling(CASE, facts(9)).decision == "partial_refund"
    refund = what_would_change(CASE, facts(6), base_ruling(CASE, facts(6)))
    up = [cf for cf in refund if cf.decision == "compensation"]
    assert up[0].change == "the unexpected stop had lasted 10 minutes or more (it lasted 6)"
    assert base_ruling(CASE, facts(10)).decision == "compensation"


def test_rule_support_and_precedents_treat_compensation_as_a_refund():
    assert rule_support(CASE, facts(14))["RD-5"] == "rider"
    assert rule_support(CASE, facts(6))["RD-5"] is None
    report = PrecedentReport(matches=[PrecedentMatch(id="P-001", similarity=0.9, decision="partial_refund")])
    assert check_consistency(report, "compensation")[0].consistency == "consistent"


def long_stop_d001() -> DisputeCase:
    """D001 with its 6-minute stop stretched to 12 minutes (later points shift by 6 minutes)."""
    d001 = next(c for c in load_samples() if c.dispute_id == "D001")
    points = [dict(p) for p in d001.gps_points]
    stop = points[20]                                           # last stationary point, 08:20
    def at(p, minutes):
        time = datetime.fromisoformat(p["timestamp"]) + timedelta(minutes=minutes)
        return {**p, "timestamp": time.isoformat()}
    extra = [at(stop, m) for m in range(1, 7)]                  # still stopped 08:21-08:26
    moved = [at(p, 6) for p in points[21:]]
    return d001.model_copy(update={"dispute_id": "D001-LONG", "gps_points": points[:21] + extra + moved})


def test_end_to_end_the_judge_may_mention_the_credit():
    reply = {
        "explanation": "RD-3 and RD-5 apply: the route was 44% longer and 59% slower, with a 12-minute stop. The rider "
                       "gets the $6.30 charged above the expected fare plus a $5.00 credit, $11.30 in total.",
        "rider_explanation": "You will receive $11.30: the $6.30 charged above the expected fare plus a $5.00 credit.",
        "driver_explanation": "The rider receives $11.30 because the detour and a long stop did not save time.",
    }
    with patch("app.agents.judge_narration.complete", return_value=json.dumps(reply)):
        result = resolve_dispute(long_stop_d001())
    assert result.decision == "compensation" and result.refund_amount == pytest.approx(11.30)
    assert [r.split(":")[0] for r in result.policy_refs] == ["RD-3", "RD-5"]
    assert result.explanation_source == "llm"
