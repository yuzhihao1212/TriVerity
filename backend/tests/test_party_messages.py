"""Party messages in a customer-service tone (round 8 item 12).

Each party's message is a greeting, what we found and what happens now. Same warmth for
both, neutral verbs, no rule or evidence IDs, and the driver is never told about a refund
as if they receive the money. Only the wording changed: decisions and amounts did not
(see test_ruling_conditions.test_all_nine_rulings_unchanged_byte_for_byte).
"""

import re

import pytest

from app.agents.judge_agent import _explain_to_parties, finish_party_messages
from app.models.resolution import Ruling
from app.services.orchestrator import resolve_dispute
from app.services.sample_service import load_samples

SAMPLES = {case.dispute_id: case for case in load_samples()}
RULE_OR_FACT_ID = re.compile(r"\b(?:RD|NS|SAFE|ESC|FRAUD|REF|PREC|TRIP|GPS|FARE|CHAT|HIST)\s*-?\s*\d+\b", re.IGNORECASE)
# Verdict words about a party, and promises the team hasn't confirmed yet.
NOT_IN_PARTY_MESSAGES = re.compile(r"\b(upheld|unjustified|justified|rejected|denied|working days?|"
                                   r"rating|within \d+ days)\b", re.IGNORECASE)
# The driver hears what the rider gets, never "you're getting/refunded".
DRIVER_RECEIVES = re.compile(r"\byou(?:'re| are| will)? (?:getting|get|be refunded|receive)\b|\byour refund\b", re.IGNORECASE)


def messages(dispute_id):
    result = resolve_dispute(SAMPLES[dispute_id])
    return result, {party: (getattr(result, f"{party}_explanation"), getattr(result, f"{party}_message"))
                    for party in ("rider", "driver")}


@pytest.mark.parametrize("dispute_id", sorted(SAMPLES))
def test_every_message_is_greeting_found_next_with_no_ids_or_verdict_words(dispute_id):
    _, both = messages(dispute_id)
    for party, (text, parts) in both.items():
        assert text == f"{parts.greeting} {parts.found} {parts.next}"
        assert parts.greeting.startswith("Hi there, thank")
        assert not RULE_OR_FACT_ID.search(text), (party, text)
        assert not NOT_IN_PARTY_MESSAGES.search(text), (party, text)
    assert not DRIVER_RECEIVES.search(both["driver"][0]), both["driver"][0]


@pytest.mark.parametrize(("dispute_id", "rider_found", "driver_found"), [
    ("D001", "you're getting $6.30 back", "the rider is getting $6.30 back"),     # partial refund
    ("D005", "you're getting $4.00 back", "the rider is getting $4.00 back"),     # full refund
    ("D003", "the charge stays as it is", "the charge stays as it is"),           # no change
    ("D006", "so the no-show fee applies", "so the no-show fee applies"),         # no change, no "justified"
])
def test_outcome_wording_for_both_parties(dispute_id, rider_found, driver_found):
    _, both = messages(dispute_id)
    assert rider_found in both["rider"][1].found
    assert driver_found in both["driver"][1].found


def test_refund_next_steps_and_driver_framing():
    _, both = messages("D001")
    assert both["rider"][1].next == "The refund goes back to your original payment method."
    assert both["driver"][1].next == "You don't need to do anything."
    # The case record's sentence about the driver's statement stays out of both messages.
    assert "driver's explanation" not in both["rider"][0] and "driver's explanation" not in both["driver"][0]


def test_no_change_tells_the_driver_their_earnings_are_unchanged():
    _, both = messages("D003")
    assert both["rider"][1].next == "You don't need to do anything."
    assert "earnings for this trip don't change" in both["driver"][1].next


@pytest.mark.parametrize("dispute_id", ["D007", "D008"])
def test_escalation_says_only_that_a_person_will_look(dispute_id):
    result, both = messages(dispute_id)
    assert result.decision == "needs_review"
    for _, (text, parts) in both.items():
        assert "closer look" in parts.found and "follow up with you" in parts.next
        assert "$" not in text and not re.search(r"threat|bad-faith|risk", text, re.IGNORECASE)


def test_missing_data_escalation_says_what_is_missing():
    _, both = messages("D002")
    assert "can't be verified without the driver's waiting time" in both["rider"][1].found


def test_compensation_names_the_fare_and_the_credit_for_both():
    ruling = Ruling(decision="compensation", recommended_action="", refund_amount=11.3, confidence=0.8,
                    explanation="The route was 44% longer than expected. The trip also included an unexpected stop of 12 minutes.",
                    policy_refs=["RD-3: x", "RD-5: y"])
    done = finish_party_messages(_explain_to_parties(ruling))
    assert "you're getting $11.30: the extra fare back plus a credit for the lost time" in done.rider_explanation
    assert "the rider is getting $11.30" in done.driver_explanation
    assert not DRIVER_RECEIVES.search(done.driver_explanation)
