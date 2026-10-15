"""Honest Judge wording that the narration checks used to reject, and the organiser loader.

Each false positive sent a demo case's Judge to Fallback on some runs with live Hy3.
The paired "still caught" cases make sure the fixes didn't open the checks up.
"""

import json
import logging

import pytest

from app.agents.judge_narration import _wording_problem
from app.services import sample_service
from app.services.text_safety import normalise


@pytest.mark.parametrize(
    ("decision", "text"),
    [
        # "no" in "no-show" was read as a negation, so a refund looked denied (D005, live).
        ("full_refund", "The no-show fee was refunded because that condition was not met."),
        ("full_refund", "Your no-show fee of $4.00 will be refunded."),
        # "get back to you" is a reply, not money (escalated and no-refund cases).
        ("needs_review", "A human reviewer will look at this and get back to you."),
        ("no_action", "The fare stands. Our support team will get back to you if you have questions."),
        ("needs_review", "A reviewer will decide and get back to the rider shortly."),
    ],
)
def test_honest_wording_accepted(decision, text):
    assert _wording_problem(normalise(text), decision) is None


@pytest.mark.parametrize(
    ("decision", "text"),
    [
        ("needs_review", "You will get $6.90 back."),
        ("needs_review", "You will get your money back to your card."),
        ("no_action", "You will be refunded $6.30."),
        ("full_refund", "The no-show fee will not be refunded."),
        ("full_refund", "There is no refund for this no-show fee."),
        ("partial_refund", "You won't get anything back."),
    ],
)
def test_real_promises_and_denials_still_caught(decision, text):
    assert _wording_problem(normalise(text), decision) is not None


def test_bad_organiser_file_is_skipped_not_fatal(tmp_path, monkeypatch, caplog):
    (tmp_path / "disputes").mkdir()
    organiser = tmp_path / "organiser"
    organiser.mkdir()
    real = sample_service.DATA_ROOT / "organiser" / "disp_002.json"
    (organiser / "disp_002.json").write_text(real.read_text())
    (organiser / "broken.json").write_text('{"dispute_ticket": {}}')
    (organiser / "not_json.json").write_text("not json at all")
    monkeypatch.setattr(sample_service, "DATA_ROOT", tmp_path)

    with caplog.at_level(logging.WARNING):
        cases = sample_service.load_samples()

    assert [c.dispute_id for c in cases] == [json.loads(real.read_text())["dispute_ticket"]["dispute_id"]]
    assert "broken.json" in caplog.text and "not_json.json" in caplog.text
