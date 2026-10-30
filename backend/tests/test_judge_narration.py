"""Tests for the LLM narration of the Judge's ruling, with the LLM call mocked."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from app.models.dispute import DisputeCase
from app.services.orchestrator import resolve_dispute

DISPUTES = Path(__file__).resolve().parents[2] / "data" / "disputes"

GOOD = {
    "explanation": "RD-3 applies: the route was 44% longer and 59% slower. The rider's argument is supported; "
                   "the driver's congestion claim is not borne out by the trip time.",
    "rider_explanation": "Your dispute was upheld and you will be refunded $6.30, the amount above the expected fare.",
    "driver_explanation": "The rider has been refunded $6.30 because the detour did not save time.",
}


def resolve(sample: str, reply) -> dict:
    """Resolve a sample with the judge's LLM call mocked (advocates stay offline)."""
    case = DisputeCase(**json.loads((DISPUTES / sample).read_text()))
    side_effect = reply if callable(reply) else (lambda *a, **k: reply)
    with patch("app.agents.judge_narration.complete", side_effect=side_effect):
        return resolve_dispute(case).model_dump()


def test_valid_narration_replaces_templates_without_changing_ruling():
    result = resolve("route_deviation_001.json", json.dumps(GOOD))
    assert result["explanation_source"] == "llm"
    assert result["rider_message"]["found"] == GOOD["rider_explanation"]
    parts = result["rider_message"]
    assert result["rider_explanation"] == f'{parts["greeting"]} {parts["found"]} {parts["next"]}'
    assert result["decision"] == "partial_refund"
    assert result["refund_amount"] == pytest.approx(6.30)


def test_fenced_json_accepted():
    result = resolve("route_deviation_001.json", "```json\n" + json.dumps(GOOD) + "\n```")
    assert result["explanation_source"] == "llm"


@pytest.mark.parametrize(
    ("change", "why"),
    [
        ({"rider_explanation": "You will be refunded $9.99."}, "invented amount"),
        ({"rider_explanation": "Your dispute was upheld and you will get a refund."}, "missing amount"),
        ({"explanation": "Under RD-1 and RD-3 the rider wins."}, "rule nobody cited"),
        ({"driver_explanation": ""}, "empty text"),
    ],
)
def test_narration_contradicting_ruling_is_rejected(change, why):
    result = resolve("route_deviation_001.json", json.dumps({**GOOD, **change}))
    assert result["explanation_source"] == "fallback", why
    assert result["rider_message"]["found"].startswith("We've looked into your trip and you're getting $6.30 back.")


def test_escalated_case_cannot_promise_refund():
    reply = {
        "explanation": "A threat was made, so SAFE-1 escalates this dispute to a human reviewer.",
        "rider_explanation": "A reviewer will look at this, and you will be refunded $6.90.",
        "driver_explanation": "A human reviewer will decide this dispute.",
    }
    result = resolve("route_deviation_004.json", json.dumps(reply))
    assert result["decision"] == "needs_review"
    assert result["explanation_source"] == "fallback"


@pytest.mark.parametrize("reply", ["not json", json.dumps({"explanation": "only one field"})])
def test_unusable_reply_falls_back(reply):
    assert resolve("route_deviation_001.json", reply)["explanation_source"] == "fallback"


def test_llm_error_falls_back():
    def boom(*args, **kwargs):
        raise TimeoutError("slow provider")
    result = resolve("no_show_002.json", boom)
    assert result["explanation_source"] == "fallback"
    assert result["decision"] == "full_refund"


def test_offline_keeps_templates_and_logs_source():
    case = DisputeCase(**json.loads((DISPUTES / "no_show_003.json").read_text()))
    result = resolve_dispute(case)
    assert result.explanation_source == "fallback"
    assert result.agent_log[-1].message.startswith("[fallback] no_action")


def _no_show_ruling_with_advocates():
    """D005: the ruling applies NS-1; the driver advocate argues NS-2 and NS-3."""
    from app.agents.judge_narration import narrate
    from app.models.resolution import AgentCase
    from app.services.policy_service import cite, load_policy

    case = DisputeCase(**json.loads((DISPUTES / "no_show_002.json").read_text()))
    with patch("app.agents.judge_narration.complete", return_value="not json"):
        ruling = resolve_dispute(case)
    section = load_policy()["no_show_charge"]
    rider = AgentCase(agent="rider_advocate", summary="x", policy_refs=[cite(section, "NS-1")], source="llm")
    driver = AgentCase(agent="driver_advocate", summary="x", policy_refs=[cite(section, "NS-2"), cite(section, "NS-3")], source="llm")
    return case, ruling, rider, driver, narrate


def test_judge_may_name_rules_an_advocate_cited():
    case, ruling, rider, driver, narrate = _no_show_ruling_with_advocates()
    reply = {
        "explanation": "NS-1 decides this: the driver stopped 378 m away. The driver's advocate cited NS-2 and "
                       "NS-3, but waiting and messaging don't matter when the driver was not at the pickup point.",
        "rider_explanation": "Your no-show fee of $4.00 will be refunded because the driver stopped 378 m away.",
        "driver_explanation": "The rider's dispute was upheld because you stopped 378 m from the pickup point.",
    }
    with patch("app.agents.judge_narration.complete", return_value=json.dumps(reply)):
        result = narrate(case, ruling, rider, driver)
    assert result.explanation_source == "llm"


def test_judge_still_cannot_name_a_rule_nobody_cited():
    case, ruling, rider, driver, narrate = _no_show_ruling_with_advocates()
    reply = {
        "explanation": "NS-1 and NS-4 decide this: the driver stopped 378 m away.",
        "rider_explanation": "Your no-show fee of $4.00 will be refunded.",
        "driver_explanation": "The rider's dispute was upheld.",
    }
    with patch("app.agents.judge_narration.complete", return_value=json.dumps(reply)):
        result = narrate(case, ruling, rider, driver)
    assert result.explanation_source == "fallback"
