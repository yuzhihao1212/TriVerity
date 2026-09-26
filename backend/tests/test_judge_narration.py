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
    assert result["rider_explanation"] == GOOD["rider_explanation"]
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
        ({"explanation": "Under RD-1 and RD-3 the rider wins."}, "rule not applied"),
        ({"driver_explanation": ""}, "empty text"),
    ],
)
def test_narration_contradicting_ruling_is_rejected(change, why):
    result = resolve("route_deviation_001.json", json.dumps({**GOOD, **change}))
    assert result["explanation_source"] == "fallback", why
    assert result["rider_explanation"].startswith("Your dispute was upheld and you will be refunded $6.30.")


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
