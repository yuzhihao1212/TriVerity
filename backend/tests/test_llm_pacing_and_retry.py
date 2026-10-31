"""The per-minute request pacer in the LLM client, and the advocates' one retry."""
import json
from unittest.mock import patch

import pytest

from app.agents._advocate import build_rebuttal
from app.agents.rider_agent import build_rider_case
from app.core import limits
from app.core.config import settings
from app.models.resolution import AgentCase
from app.services import llm_client
from app.services.llm_client import LLMBusy, RequestPacer
from app.services.sample_service import load_samples
from app.services.evidence import compute_facts


def _case_and_facts():
    case = next(c for c in load_samples() if c.dispute_id == "D001")
    return case, compute_facts(case)


GOOD_CASE = json.dumps({"summary": "Refund the extra fare: the route was much longer.", "evidence_ids": [], "policy_refs": ["RD-3"]})
GOOD_REPLY = json.dumps({"rebuttal": "The route was far longer than planned.", "evidence_ids": []})
CUT_OFF = '{"summary": "The route was much longer and'


# -- Pacer --------------------------------------------------------------------

def test_calls_under_the_limit_do_not_wait():
    pacer = RequestPacer(3)
    assert [pacer.wait_seconds(100.0, 60) for _ in range(3)] == [0, 0, 0]


def test_call_over_the_limit_waits_for_the_oldest_to_leave_the_window():
    pacer = RequestPacer(2)
    pacer.wait_seconds(100.0, 60)
    pacer.wait_seconds(110.0, 60)
    assert pacer.wait_seconds(120.0, 60) == 40.0   # slot at 160, a minute after the call at 100


def test_waiting_calls_queue_in_order_and_never_exceed_the_limit():
    pacer = RequestPacer(2)
    waits = [pacer.wait_seconds(100.0, 120) for _ in range(5)]
    assert waits == [0, 0, 60.0, 60.0, 120.0]


def test_old_calls_free_their_slots():
    pacer = RequestPacer(1)
    pacer.wait_seconds(100.0, 60)
    assert pacer.wait_seconds(161.0, 60) == 0


def test_a_wait_over_the_maximum_gives_up_and_books_nothing():
    pacer = RequestPacer(1)
    pacer.wait_seconds(100.0, 60)
    with pytest.raises(LLMBusy):
        pacer.wait_seconds(100.0, 30)
    assert pacer.wait_seconds(161.0, 30) == 0


def test_the_configured_rate_stays_under_the_providers_limit():
    assert limits.LLM_REQUESTS_PER_MINUTE < 60
    assert llm_client.pacer.per_minute == limits.LLM_REQUESTS_PER_MINUTE


class _FakeClient:
    posts = 0

    def __init__(self, **_):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def post(self, *_, **__):
        _FakeClient.posts += 1
        class Response:
            def raise_for_status(self):
                pass

            def json(self):
                return {"choices": [{"message": {"content": "{}"}}], "usage": {"total_tokens": 1}}
        return Response()


def test_complete_sleeps_for_its_slot(monkeypatch):
    monkeypatch.setattr(settings, "llm_api_key", "test-key")
    monkeypatch.setattr(llm_client.httpx, "Client", _FakeClient)
    monkeypatch.setattr(llm_client, "pacer", RequestPacer(1))
    monkeypatch.setattr(llm_client.time, "monotonic", lambda: 100.0)
    slept = []
    monkeypatch.setattr(llm_client.time, "sleep", slept.append)
    llm_client.complete("s", "u")
    llm_client.complete("s", "u")
    assert slept == [60.0]


def test_complete_raises_rather_than_calling_when_the_queue_is_too_long(monkeypatch):
    monkeypatch.setattr(settings, "llm_api_key", "test-key")
    monkeypatch.setattr(llm_client.httpx, "Client", _FakeClient)
    monkeypatch.setattr(llm_client, "pacer", RequestPacer(1))
    monkeypatch.setattr(llm_client.time, "monotonic", lambda: 100.0)
    monkeypatch.setattr(llm_client.time, "sleep", lambda _: None)
    monkeypatch.setattr(limits, "LLM_MAX_WAIT_S", 10)
    _FakeClient.posts = 0
    llm_client.complete("s", "u")
    with pytest.raises(LLMBusy):
        llm_client.complete("s", "u")
    assert _FakeClient.posts == 1


def test_offline_calls_take_no_slot(monkeypatch):
    monkeypatch.setattr(llm_client, "pacer", RequestPacer(1))
    for _ in range(3):
        assert llm_client.complete("s", "u") == llm_client.OFFLINE_PLACEHOLDER
    assert llm_client.pacer.wait_seconds(100.0, 0) == 0


# -- One retry ----------------------------------------------------------------

def _rider(replies):
    case, facts = _case_and_facts()
    with patch("app.agents._advocate.complete", side_effect=replies) as mock:
        return build_rider_case(case, facts), mock.call_count


def test_advocate_retries_a_cut_off_reply_and_uses_the_second():
    result, calls = _rider([CUT_OFF, GOOD_CASE])
    assert (result.source, calls) == ("llm", 2)


def test_advocate_retries_a_reply_over_the_length_limit():
    long = json.dumps({"summary": "The route was long. " * 100, "evidence_ids": []})
    result, calls = _rider([long, GOOD_CASE])
    assert (result.source, calls) == ("llm", 2)


def test_advocate_retries_only_once_then_falls_back():
    result, calls = _rider([CUT_OFF, CUT_OFF])
    assert (result.source, calls) == ("fallback", 2)


def test_advocate_does_not_retry_a_good_reply():
    result, calls = _rider([GOOD_CASE])
    assert (result.source, calls) == ("llm", 1)


def test_advocate_does_not_retry_a_provider_error():
    result, calls = _rider([RuntimeError("HTTP 429")])
    assert (result.source, calls) == ("fallback", 1)


def test_advocate_does_not_retry_an_unsafe_reply():
    unsafe = json.dumps({"summary": "See https://example.com for the refund.", "evidence_ids": []})
    result, calls = _rider([unsafe])
    assert (result.source, calls) == ("fallback", 1)


def _reply(replies):
    case, facts = _case_and_facts()
    own = AgentCase(agent="rider_advocate", summary="Refund it.", source="llm")
    other = AgentCase(agent="driver_advocate", summary="Keep the charge.", source="llm")
    with patch("app.agents._advocate.complete", side_effect=replies) as mock:
        return build_rebuttal(party="rider", own_case=own, other_case=other, facts=facts, dispute_type=case.type), mock.call_count


def test_rebuttal_retries_a_cut_off_reply_and_uses_the_second():
    result, calls = _reply(['{"rebuttal": "The driver wins on facts. The', GOOD_REPLY])
    assert (result.source, calls) == ("llm", 2)


def test_rebuttal_retries_a_reply_over_the_length_limit():
    long = json.dumps({"rebuttal": "The driver wins on facts. " * 60})
    result, calls = _reply([long, GOOD_REPLY])
    assert (result.source, calls) == ("llm", 2)


def test_rebuttal_retries_only_once_then_gives_no_reply():
    result, calls = _reply(["not json", "not json"])
    assert (result.text, calls) == ("", 2)


def test_rebuttal_does_not_retry_a_provider_error():
    result, calls = _reply([RuntimeError("HTTP 429")])
    assert (result.text, calls) == ("", 1)


def test_rebuttal_offline_makes_one_call_and_gives_no_reply():
    result, calls = _reply([llm_client.OFFLINE_PLACEHOLDER])
    assert (result.text, calls) == ("", 1)
