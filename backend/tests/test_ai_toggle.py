"""ai=off: resolve without calling the LLM (the console's offline mode)."""
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.api.routes import disputes
from app.core.config import settings
from app.core.rate_limit import limiter
from app.main import create_app
from app.services.budget import budget
from app.services.llm_client import ai_disabled, carry_context, complete, OFFLINE_PLACEHOLDER
from app.services.sample_service import load_samples

D001 = next(c for c in load_samples() if c.dispute_id == "D001")


def boom(*args, **kwargs):
    raise AssertionError("the LLM must not be called when AI is off")


@pytest.fixture
def online(monkeypatch):
    """Pretend a key is configured, and fail if any HTTP call is attempted."""
    monkeypatch.setattr(settings, "llm_api_key", "test-key-not-real")
    limiter.reset()
    with patch("app.services.llm_client.httpx.Client", side_effect=boom):
        yield TestClient(create_app())


def test_ai_disabled_short_circuits_complete_and_resets(monkeypatch):
    monkeypatch.setattr(settings, "llm_api_key", "test-key-not-real")
    with ai_disabled():
        assert complete("s", "u") == OFFLINE_PLACEHOLDER
    with patch("app.services.llm_client.httpx.Client", side_effect=boom):
        with pytest.raises(AssertionError):
            complete("s", "u")   # back on outside the block


def test_the_switch_follows_the_request_into_worker_threads():
    from concurrent.futures import ThreadPoolExecutor
    from app.services.llm_client import _ai_off
    with ai_disabled(), ThreadPoolExecutor(2) as pool:
        assert pool.submit(carry_context(_ai_off.get)).result() is True
    with ThreadPoolExecutor(1) as pool:
        assert pool.submit(carry_context(_ai_off.get)).result() is False


def test_offline_resolve_never_calls_the_llm_and_keeps_the_ruling(online):
    body = D001.model_dump(mode="json")
    result = online.post("/api/disputes/resolve?ai=off", json=body).json()
    assert (result["decision"], result["refund_amount"]) == ("partial_refund", 6.3)
    assert result["explanation_source"] == result["rider_case"]["source"] == result["evidence_collection"]["source"] == "fallback"


def test_offline_stream_never_calls_the_llm(online):
    response = online.post("/api/disputes/resolve/stream?ai=off", json=D001.model_dump(mode="json"))
    events = [line[7:] for line in response.text.splitlines() if line.startswith("event: ")]
    assert events[-1] == "result" and events.count("step") == 9


def test_offline_runs_skip_the_budget_and_the_public_demo_cache(online, monkeypatch):
    monkeypatch.setattr(settings, "public_demo", True)
    disputes._demo_cache.clear()
    with patch.object(budget, "record_resolve", side_effect=boom):
        assert online.post("/api/disputes/resolve?ai=off", json=D001.model_dump(mode="json")).status_code == 200
    assert disputes._demo_cache == {}


def test_ai_parameter_is_validated(online):
    assert online.post("/api/disputes/resolve?ai=maybe", json=D001.model_dump(mode="json")).status_code == 422
