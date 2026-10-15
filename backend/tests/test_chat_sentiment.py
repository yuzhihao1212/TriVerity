"""Per-party chat tone: deterministic evidence that never changes a ruling or reaches the parties."""
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from app.models.dispute import ChatMessage, DisputeCase
from app.services.evidence import analyse_chat, compute_facts
from app.services.orchestrator import resolve_dispute

DISPUTES = Path(__file__).resolve().parents[2] / "data" / "disputes"

def chat(*lines: tuple[str, str]) -> list[ChatMessage]:
    return [ChatMessage(sender=sender, message=text) for sender, text in lines]

def load(name: str) -> DisputeCase:
    return DisputeCase(**json.loads((DISPUTES / name).read_text()))

def test_tone_is_computed_per_party():
    analysis = analyse_chat(chat(
        ("rider", "This is unfair, the route was wrong."),
        ("rider", "Ridiculous detour."),
        ("rider", "Where are you?"),
        ("driver", "Thanks for waiting, sorry about the traffic."),
    ))
    assert (analysis.rider_tone.tone, analysis.rider_tone.messages, analysis.rider_tone.total) == ("negative", 2, 3)
    assert (analysis.driver_tone.tone, analysis.driver_tone.messages, analysis.driver_tone.total) == ("positive", 1, 1)

def test_negative_wins_over_positive_in_one_message():
    assert analyse_chat(chat(("rider", "Not great, this is unfair. Thanks anyway."))).rider_tone.tone == "negative"

def test_a_threat_makes_the_tone_hostile():
    analysis = analyse_chat(chat(
        ("driver", "Thanks, have a good day."),
        ("driver", "Thanks again."),
        ("driver", "Pay up or else."),
    ))
    assert (analysis.driver_tone.tone, analysis.driver_tone.messages, analysis.driver_tone.total) == ("hostile", 1, 3)

def test_ties_go_negative_then_positive():
    assert analyse_chat(chat(("rider", "Thanks."), ("rider", "This is wrong."))).rider_tone.tone == "negative"
    assert analyse_chat(chat(("rider", "Thanks."), ("rider", "Where are you?"))).rider_tone.tone == "positive"

def test_system_messages_are_ignored_and_silent_parties_get_no_tone():
    analysis = analyse_chat(chat(("system", "Trip cancelled. This is unfair or else."), ("driver", "I'm here.")))
    assert analysis.rider_tone is None
    assert (analysis.driver_tone.tone, analysis.driver_tone.total) == ("neutral", 1)

def test_no_chat_means_no_tone_line():
    case = load("route_deviation_002.json")
    assert not case.chat_logs
    lines = compute_facts(case).describe_by_source().get("chat", [])
    assert not any("tone" in line for line in lines)

def test_tone_lines_come_last_in_the_chat_group():
    case = load("route_deviation_004.json")  # D007: rider complains, driver threatens
    lines = compute_facts(case).describe_by_source()["chat"]
    assert lines[-2:] == ["Rider tone: negative (1 of 1 message)", "Driver tone: hostile (1 of 1 message)"]

@pytest.mark.parametrize("sample", sorted(p.name for p in DISPUTES.glob("*.json")))
def test_rulings_are_unchanged_without_tone(sample):
    case = load(sample)
    with_tone = resolve_dispute(case)
    blank = {"rider_tone": None, "driver_tone": None}
    with patch("app.services.evidence.analyse_chat",
               side_effect=lambda msgs, _real=analyse_chat: _real(msgs).model_copy(update=blank)):
        without_tone = resolve_dispute(case)
    for field in ("decision", "refund_amount", "confidence", "policy_refs"):
        assert getattr(with_tone, field) == getattr(without_tone, field), field
    assert with_tone.triage == without_tone.triage

def test_the_judge_narration_never_sees_tone():
    seen = []
    def capture(system, user, **_):
        seen.append(user)
        raise RuntimeError("offline")
    with patch("app.agents.judge_narration.complete", side_effect=capture):
        resolve_dispute(load("route_deviation_004.json"))
    assert seen and not any("tone:" in prompt for prompt in seen)

@pytest.mark.parametrize("leak", [
    "Your hostile tone was noted.", "The driver's attitude was a factor.", "Chat sentiment was negative.",
])
def test_party_message_describing_tone_falls_back(leak):
    good = {
        "explanation": "RD-3 applies: the route was 44% longer and 59% slower.",
        "rider_explanation": f"Your dispute was upheld and you will be refunded $6.30. {leak}",
        "driver_explanation": "The rider has been refunded $6.30 because the detour did not save time.",
    }
    with patch("app.agents.judge_narration.complete", side_effect=lambda *a, **k: json.dumps(good)):
        result = resolve_dispute(load("route_deviation_001.json"))
    assert result.explanation_source == "fallback"
