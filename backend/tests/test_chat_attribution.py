"""A party is only credited with chat messages it sent (D006: the rider wrote "Ok, 5 more minutes.").

The LLM is mocked throughout; no test calls a real model.
"""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from app.agents._advocate import (
    advocate_system_prompt, build_rebuttal, chat_senders, evidence_index, misattributed_chat, rebuttal_system_prompt,
    strip_id_lists, strip_leaked_rules,
)
from app.agents.rider_agent import build_rider_case
from app.models.dispute import DisputeCase
from app.models.resolution import AgentCase
from app.services.evidence import compute_facts

DISPUTES = Path(__file__).resolve().parents[2] / "data" / "disputes"
D006 = DisputeCase(**json.loads((DISPUTES / "no_show_003.json").read_text()))
# As in a real run: the evidence collector adds the chat window, one line per message.
FACTS = compute_facts(D006).model_copy(update={"collected": {"chat": [
    'Chat 19:02 driver: "I\'ve arrived at the pickup point."',
    'Chat 19:06 driver: "Still waiting, are you coming?"',
    'Chat 19:07 rider: "Ok, 5 more minutes."',
]}})
SENDERS = chat_senders(FACTS)


def chat_id(sender: str, words: str) -> str:
    """The ID of a chat fact from ``sender`` quoting ``words``."""
    index = evidence_index(FACTS)
    return next(i for i, who in SENDERS.items() if who == sender and words in index[i][1])


RIDER_OK = chat_id("rider", "5 more minutes")
DRIVER_WAITING = chat_id("driver", "Still waiting")


def test_every_quoted_chat_fact_has_its_sender():
    assert SENDERS[RIDER_OK] == "rider" and SENDERS[DRIVER_WAITING] == "driver"
    assert "driver" in SENDERS.values() and "rider" in SENDERS.values()
    assert all(fact_id.startswith("CHAT-") for fact_id in SENDERS)


@pytest.mark.parametrize("text", [
    f"The rider was a few minutes late but the driver agreed in chat to wait 5 more minutes ({RIDER_OK}).",
    f"The driver said they would wait ({RIDER_OK}).",
    f"Then the rider asked if they were coming ({DRIVER_WAITING}).",
])
def test_crediting_the_wrong_party_is_caught(text):
    assert misattributed_chat(text, SENDERS).startswith("attribution:")


@pytest.mark.parametrize("text", [
    f"The rider replied they needed 5 more minutes ({RIDER_OK}).",
    f"The driver asked whether the rider was coming ({DRIVER_WAITING}).",
    f"The driver asked ({DRIVER_WAITING}) and the rider replied ({RIDER_OK}).",
    f"The rider was late. The driver waited 7 minutes ({RIDER_OK}).",  # no speech claimed
    "The driver agreed to wait.",                                         # nothing cited inline
    f"The driver agreed to wait (CHAT-99).",                              # unknown ID: not this check's job
])
def test_correct_or_uncheckable_attribution_passes(text):
    assert misattributed_chat(text, SENDERS) is None


def test_advocate_misattribution_falls_back_to_the_template():
    reply = {"summary": f"The driver agreed in chat to wait 5 more minutes ({RIDER_OK}).",
             "evidence_ids": [RIDER_OK], "policy_refs": []}
    with patch("app.agents._advocate.complete", return_value=json.dumps(reply)):
        result = build_rider_case(D006, FACTS)
    assert result.source == "fallback"
    assert "agreed" not in result.summary


def test_advocate_with_correct_attribution_is_kept():
    reply = {"summary": f"The rider told the driver they needed 5 more minutes ({RIDER_OK}).",
             "evidence_ids": [RIDER_OK], "policy_refs": []}
    with patch("app.agents._advocate.complete", return_value=json.dumps(reply)):
        result = build_rider_case(D006, FACTS)
    assert result.source == "llm" and result.summary == reply["summary"]


def test_rebuttal_misattribution_is_dropped():
    own, other = (AgentCase(agent=a, summary="An argument.", source="llm") for a in ("driver_advocate", "rider_advocate"))
    reply = json.dumps({"rebuttal": f"The rider promised to come straight away ({DRIVER_WAITING}).",
                        "evidence_ids": [DRIVER_WAITING]})
    with patch("app.agents._advocate.complete", return_value=reply):
        result = build_rebuttal(party="driver", own_case=own, other_case=other, facts=FACTS, dispute_type=D006.type)
    assert result.source == "fallback" and result.text == ""


def test_both_prompts_say_to_credit_only_the_sender():
    assert "never credit one party with the other's words" in advocate_system_prompt("rider", "claim")
    assert "never credit one party with the other's words" in rebuttal_system_prompt("driver", "rider")


# -- Leaked instructions -------------------------------------------------------

# The rider rebuttal from a live Hy3 run of D006 (29 Oct 2026), ending with its own rules.
LIVE_REBUTTAL = (
    "The driver advocate overstates by saying all fee conditions were met; the rider agreed to 5 more minutes "
    "(CHAT-2) yet was charged a no-show fee (TRIP-4) without evidence they failed to appear. The fee is unfair "
    "given the rider's stated willingness to wait briefly. Driver met proximity, wait and contact rules but rider "
    "acceptance of delay is ignored. Only cited facts used. Never concede."
)


def test_leaked_rules_are_dropped_and_the_argument_kept():
    cleaned = strip_leaked_rules(LIVE_REBUTTAL, "rider_rebuttal")
    assert cleaned.endswith("rider acceptance of delay is ignored.")
    assert "Never concede" not in cleaned and "Only cited facts used" not in cleaned


@pytest.mark.parametrize("sentence", [
    "Never concede.", "Only cited facts used.", "Do not invent facts.", "No ruling issued.",
    "As instructed, this uses the evidence only.", "Using only the provided facts, the fee stands.",
    "See evidence_ids above.",
])
def test_instruction_echoes_are_recognised(sentence):
    assert strip_leaked_rules(f"The driver waited 7 minutes. {sentence}", "x") == "The driver waited 7 minutes."


@pytest.mark.parametrize("text", [
    "Only the chat shows the driver made contact before charging the fee.",
    "The rider never conceded that they were late.",
    "No message from the rider asked the driver to leave.",
    "Never once did the driver cancel early.",
])
def test_ordinary_arguments_are_kept(text):
    assert strip_leaked_rules(text, "x") == text


def test_rebuttal_with_leaked_rules_is_shown_without_them():
    own, other = (AgentCase(agent=a, summary="An argument.", source="llm") for a in ("rider_advocate", "driver_advocate"))
    with patch("app.agents._advocate.complete", return_value=json.dumps({"rebuttal": LIVE_REBUTTAL, "evidence_ids": []})):
        result = build_rebuttal(party="rider", own_case=own, other_case=other, facts=FACTS, dispute_type=D006.type)
    assert result.source == "llm" and result.text.endswith("is ignored.") and "Never concede" not in result.text


def test_summary_that_is_only_leaked_rules_falls_back():
    reply = {"summary": "Only cited facts used. Never concede.", "evidence_ids": [], "policy_refs": []}
    with patch("app.agents._advocate.complete", return_value=json.dumps(reply)):
        result = build_rider_case(D006, FACTS)
    assert result.source == "fallback"


# -- Citations listed in the text ----------------------------------------------

# Rebuttals from a second live Hy3 run of D006 (29 Oct 2026), ending with bare ID lists.
LIVE_RIDER_IDS = ("The rider only agreed in chat to 5 more minutes (CHAT-2) and was a few minutes late. "
                  "The fee remains unfair to the rider. TRIP-4, CHAT-2.")
LIVE_DRIVER_IDS = ("The rider agreed to 5 more minutes (CHAT-2) yet never appeared. The fee is earned under the facts. "
                   "None show unfairness. CHAT-2, TRIP-1, TRIP-2, TRIP-3, CHAT-1, TRIP-4")


@pytest.mark.parametrize("text, tail, ids", [
    (LIVE_RIDER_IDS, "The fee remains unfair to the rider.", ["TRIP-4", "CHAT-2"]),
    (LIVE_DRIVER_IDS, "None show unfairness.", ["CHAT-2", "TRIP-1", "TRIP-2", "TRIP-3", "CHAT-1", "TRIP-4"]),
    ("The driver waited. (trip-2 and trip-3)", "The driver waited.", ["TRIP-2", "TRIP-3"]),
])
def test_bare_id_lists_are_dropped_and_returned(text, tail, ids):
    cleaned, listed = strip_id_lists(text)
    assert cleaned.endswith(tail) and listed == ids


def test_ids_inside_a_sentence_stay():
    text = "The driver waited 7 minutes (TRIP-2), so NS-2 is met."
    assert strip_id_lists(text) == (text, [])


def test_listed_ids_become_the_rebuttals_citations_when_the_field_is_empty():
    own, other = (AgentCase(agent=a, summary="An argument.", source="llm") for a in ("driver_advocate", "rider_advocate"))
    with patch("app.agents._advocate.complete", return_value=json.dumps({"rebuttal": LIVE_DRIVER_IDS, "evidence_ids": []})):
        result = build_rebuttal(party="driver", own_case=own, other_case=other, facts=FACTS, dispute_type=D006.type)
    assert result.text.endswith("None show unfairness.")
    # Listed IDs go through the usual check: only facts that exist in this case are cited.
    listed = ["CHAT-2", "TRIP-1", "TRIP-2", "TRIP-3", "CHAT-1", "TRIP-4"]
    assert result.evidence_ids == [i for i in listed if i in evidence_index(FACTS)] and result.evidence_ids


def test_the_field_wins_over_listed_ids():
    reply = {"summary": "The driver waited 7 minutes. TRIP-1, TRIP-4.", "evidence_ids": ["TRIP-2"], "policy_refs": []}
    with patch("app.agents._advocate.complete", return_value=json.dumps(reply)):
        result = build_rider_case(D006, FACTS)
    assert result.summary == "The driver waited 7 minutes." and result.evidence_ids == ["TRIP-2"]


def test_advocate_listing_ids_without_the_field_cites_them():
    reply = {"summary": "The driver waited 7 minutes. TRIP-2.", "policy_refs": []}
    with patch("app.agents._advocate.complete", return_value=json.dumps(reply)):
        result = build_rider_case(D006, FACTS)
    assert result.summary == "The driver waited 7 minutes." and result.evidence_ids == ["TRIP-2"]


def test_advocates_open_with_their_own_clients_ask():
    assert "why the charge should be refunded to the rider" in advocate_system_prompt("rider", "claim")
    driver = advocate_system_prompt("driver", "account")
    assert "why the charge should stand" in driver and "refunded to the driver" not in driver

