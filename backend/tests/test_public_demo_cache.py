"""Public samples retain successful AI runs, but retry fallback steps promptly."""
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.api.routes import disputes
from app.core import limits
from app.core.config import settings
from app.core.rate_limit import limiter
from app.main import create_app
from app.models.resolution import AgentCase, EvidenceCollection, Rebuttal, Resolution
from app.services.budget import budget
from app.services.sample_service import load_samples

CODE = "test-judge-0123456789abcdef"
RESOLVE = "/api/disputes/resolve"


class FakeClock:
    now = 1_000_000.0

    def __call__(self):
        return self.now


@pytest.fixture
def demo(monkeypatch):
    clock = FakeClock()
    monkeypatch.setattr(settings, "public_demo", True)
    monkeypatch.setattr(settings, "demo_access_codes", CODE)
    # Scope the clock to this route and limiter, not Python's global time module.
    monkeypatch.setattr(disputes, "time", SimpleNamespace(monotonic=clock))
    monkeypatch.setattr(limiter, "clock", clock)
    disputes._demo_cache.clear()
    with TestClient(create_app()) as client:
        yield client, clock
    disputes._demo_cache.clear()


@pytest.fixture
def all_ai():
    return Resolution(
        decision="no_action", recommended_action="Keep the charge.", confidence=0.85,
        explanation="The recorded facts support the charge.", explanation_source="llm",
        rider_case=AgentCase(agent="rider_advocate", summary="Rider argument", source="llm",
                            rebuttal=Rebuttal(text="Rider reply", source="llm")),
        driver_case=AgentCase(agent="driver_advocate", summary="Driver argument", source="llm",
                             rebuttal=Rebuttal(text="Driver reply", source="llm")),
        evidence_collection=EvidenceCollection(source="llm"),
    )


def post(client, case, **kwargs):
    response = client.post(RESOLVE, json=case.model_dump(), **kwargs)
    assert response.status_code == 200, response.text
    return response.json()


def test_all_ai_sample_is_cached_for_seven_days(demo, all_ai, monkeypatch):
    client, clock = demo
    case = load_samples()[0]
    resolver = Mock(return_value=all_ai)
    monkeypatch.setattr(disputes, "resolve_dispute", resolver)
    start = clock.now
    first = post(client, case)
    for elapsed in (6 * 3600, 6 * 24 * 3600, 7 * 24 * 3600 - 1):
        clock.now = start + elapsed
        assert post(client, case) == first
        assert resolver.call_count == 1
    clock.now = start + 7 * 24 * 3600
    post(client, case)
    assert resolver.call_count == 2


@pytest.mark.parametrize("step", [
    "rider_case", "driver_case", "rider_reply", "driver_reply", "explanation", "collector",
    "no_rider_reply", "no_driver_reply", "empty_rider_reply", "empty_driver_reply",
])
def test_any_fallback_or_skipped_step_expires_after_five_minutes(demo, all_ai, monkeypatch, step):
    client, clock = demo
    result = all_ai.model_copy(deep=True)
    if step in ("rider_case", "driver_case"):
        getattr(result, step).source = "fallback"
    elif step == "explanation":
        result.explanation_source = "fallback"
    elif step == "collector":
        result.evidence_collection.source = "fallback"
    else:
        advocate = result.rider_case if "rider" in step else result.driver_case
        if step.startswith("no_"):
            advocate.rebuttal = None
        elif step.startswith("empty_"):
            advocate.rebuttal.text = "  "
        else:
            advocate.rebuttal.source = "fallback"
    resolver = Mock(return_value=result)
    monkeypatch.setattr(disputes, "resolve_dispute", resolver)
    case = load_samples()[0]
    post(client, case)
    clock.now += 299
    post(client, case)
    assert resolver.call_count == 1
    clock.now += 1
    post(client, case)
    assert resolver.call_count == 2


def test_successful_retry_upgrades_a_fallback_entry_to_week_long_cache(demo, all_ai, monkeypatch):
    client, clock = demo
    fallback = all_ai.model_copy(update={"explanation_source": "fallback"})
    resolver = Mock(side_effect=[fallback, all_ai])
    monkeypatch.setattr(disputes, "resolve_dispute", resolver)
    case = load_samples()[0]
    assert post(client, case)["explanation_source"] == "fallback"
    clock.now += 300
    assert post(client, case)["explanation_source"] == "llm"
    clock.now += 6 * 24 * 3600
    assert post(client, case)["explanation_source"] == "llm"
    assert resolver.call_count == 2


def test_sample_entries_are_independent_and_cache_hits_do_not_spend_budget(demo, all_ai, monkeypatch):
    client, _ = demo
    a, b = load_samples()[:2]
    resolver = Mock(return_value=all_ai)
    monkeypatch.setattr(disputes, "resolve_dispute", resolver)
    record = Mock(wraps=budget.record_resolve)
    monkeypatch.setattr(budget, "record_resolve", record)
    post(client, a)
    post(client, b)
    post(client, a)
    assert resolver.call_count == record.call_count == 2
    assert set(disputes._demo_cache) == {a.dispute_id, b.dispute_id}
    assert [call.args[0].dispute_id for call in resolver.call_args_list] == [a.dispute_id, b.dispute_id]


@pytest.mark.parametrize("own_id", ["OWN-CASE", "D001"])
def test_access_code_resolves_bypass_the_cache(demo, all_ai, monkeypatch, own_id):
    client, _ = demo
    case = load_samples()[0].model_copy(update={"dispute_id": own_id})
    resolver = Mock(return_value=all_ai)
    monkeypatch.setattr(disputes, "resolve_dispute", resolver)
    for _ in range(2):
        post(client, case, headers={"X-Demo-Key": CODE})
    assert resolver.call_count == 2
    assert disputes._demo_cache == {}


def test_cache_hits_still_enforce_rate_limits(demo, all_ai, monkeypatch):
    client, _ = demo
    resolver = Mock(return_value=all_ai)
    monkeypatch.setattr(disputes, "resolve_dispute", resolver)
    case = load_samples()[0]
    for _ in range(limits.PER_IP_PER_MINUTE):
        post(client, case)
    assert client.post(RESOLVE, json=case.model_dump()).status_code == 429
    assert resolver.call_count == 1
