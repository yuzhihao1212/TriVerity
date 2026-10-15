"""SSE transport tests; the autouse fixture blocks all real provider traffic."""
import asyncio
import json
import threading
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.api.routes import disputes
from app.core import limits
from app.core.config import settings
from app.main import create_app
from app.services.budget import budget
from app.services.orchestrator import ServiceBusy, resolve_dispute
from app.services.sample_service import load_samples

STREAM = "/api/disputes/resolve/stream"
NORMAL = "/api/disputes/resolve"
CASE = next(c for c in load_samples() if c.dispute_id == "D001")
CODE = "stream-judge-0123456789abcdef"


def events(text):
    output = []
    for frame in text.split("\n\n"):
        lines = frame.splitlines()
        name = next((s[7:] for s in lines if s.startswith("event: ")), None)
        if name:
            output.append((name, json.loads("\n".join(s[6:] for s in lines if s.startswith("data: ")))))
    return output


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "public_demo", False)
    disputes._demo_cache.clear()
    yield TestClient(create_app())
    disputes._demo_cache.clear()


def test_event_order_and_result_equal_offline_normal_resolve(client):
    normal = client.post(NORMAL, json=CASE.model_dump(mode="json")).json()
    response = client.post(STREAM, json=CASE.model_dump(mode="json"))
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["x-accel-buffering"] == "no"
    recorded = events(response.text)
    result = recorded[-1][1]
    assert [name for name, _ in recorded] == ["step"] * len(result["agent_log"]) + ["result"]
    assert [data for _, data in recorded[:-1]] == result["agent_log"]
    # Separate actual runs have different clocks, but identical complete rulings.
    for output in (normal, result):
        for step in output["agent_log"]:
            assert step.pop("started_at")
            assert step.pop("duration_ms") >= 0
    assert result == normal


def test_busy_error_and_ordinary_503_unchanged(client, monkeypatch):
    def busy(*args, **kwargs):
        raise ServiceBusy
    monkeypatch.setattr(disputes, "resolve_dispute", busy)
    assert events(client.post(STREAM, json=CASE.model_dump(mode="json")).text) == [
        ("error", {"status": 503, "detail": "Busy; try again shortly."})]
    assert client.post(NORMAL, json=CASE.model_dump(mode="json")).status_code == 503


def test_rate_limits_shared_and_429_is_sse(client, monkeypatch):
    monkeypatch.setattr(limits, "PER_IP_PER_MINUTE", 1)
    assert client.post(STREAM, json=CASE.model_dump(mode="json")).status_code == 200
    normal = client.post(NORMAL, json=CASE.model_dump(mode="json"))
    assert normal.status_code == 429 and "application/json" in normal.headers["content-type"]
    response = client.post(STREAM, json=CASE.model_dump(mode="json"))
    assert response.status_code == 429 and int(response.headers["retry-after"]) > 0
    assert events(response.text)[0][1]["status"] == 429
    assert budget.resolves_used == 1


@pytest.mark.parametrize("view", ["rider", "driver", "unknown"])
def test_reject_non_internal_views(client, view):
    with patch.object(disputes, "resolve_dispute") as run:
        response = client.post(f"{STREAM}?view={view}", json=CASE.model_dump(mode="json"))
    assert response.status_code == 422
    assert events(response.text)[0][1]["status"] == 422
    run.assert_not_called()


def test_validation_error_does_not_echo_input(client):
    payload = CASE.model_dump(mode="json")
    payload["fare"]["actual"] = "private-invalid-value"
    response = client.post(STREAM, json=payload)
    assert response.status_code == 422
    assert events(response.text)[0][1]["status"] == 422
    assert "private-invalid-value" not in response.text


def test_bad_access_code_is_401_event(client, monkeypatch):
    monkeypatch.setattr(settings, "demo_access_codes", CODE)
    response = client.post(STREAM, json=CASE.model_dump(mode="json"), headers={"X-Demo-Key": CODE + "wrong"})
    assert response.status_code == 401 and events(response.text)[0][1]["status"] == 401
    assert CODE not in response.text


def test_unexpected_worker_error_is_safe(client, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("private-provider-detail")
    monkeypatch.setattr(disputes, "resolve_dispute", broken)
    response = client.post(STREAM, json=CASE.model_dump(mode="json"))
    assert events(response.text) == [("error", {"status": 500, "detail": "Unable to finish the dispute."})]


def test_public_server_sample_and_cache_shared_both_directions(client, monkeypatch):
    monkeypatch.setattr(settings, "public_demo", True)
    monkeypatch.setattr(limits, "PER_IP_PER_MINUTE", 10)
    forged = CASE.model_dump(mode="json")
    forged["fare"]["actual"] = 999
    with patch.object(disputes, "resolve_dispute", wraps=resolve_dispute) as run:
        first = events(client.post(STREAM, json=forged).text)
        normal = client.post(NORMAL, json=forged).json()
        second = events(client.post(STREAM, json=forged).text)
    assert run.call_count == 1 and budget.resolves_used == 1
    assert first == second
    assert first[-1] == ("result", normal)
    assert normal["refund_amount"] == pytest.approx(6.30)
    # Conversely, a normal resolve can populate the cache for the stream.
    disputes._demo_cache.clear()
    normal = client.post(NORMAL, json=forged).json()
    with patch.object(disputes, "resolve_dispute", side_effect=AssertionError("must not run")) as run:
        response = events(client.post(STREAM, json=forged).text)
    run.assert_not_called()
    assert response == [("step", step) for step in normal["agent_log"]] + [("result", normal)]


def test_unknown_public_sample_is_404_event(client, monkeypatch):
    monkeypatch.setattr(settings, "public_demo", True)
    payload = CASE.model_dump(mode="json")
    payload["dispute_id"] = "UNKNOWN"
    response = client.post(STREAM, json=payload)
    assert events(response.text)[0][1]["status"] == 404
    assert budget.resolves_used == 0


def test_access_code_streams_are_not_cached(client, monkeypatch):
    monkeypatch.setattr(settings, "public_demo", True)
    monkeypatch.setattr(settings, "demo_access_codes", CODE)
    payload = CASE.model_dump(mode="json")
    payload.update(dispute_id="JUDGE-STREAM")
    payload["fare"]["actual"] = 30
    with patch.object(disputes, "resolve_dispute", wraps=resolve_dispute) as run:
        for _ in range(2):
            result = events(client.post(STREAM, json=payload, headers={"X-Demo-Key": CODE}).text)[-1][1]
            assert result["refund_amount"] == pytest.approx(11.50)
    assert run.call_count == 2 and budget.resolves_used == 2
    assert disputes._demo_cache == {}


def test_step_yielded_before_worker_returns(monkeypatch):
    result = resolve_dispute(CASE)
    release = threading.Event()
    def controlled(case, on_step):
        on_step(result.agent_log[0])
        assert release.wait(2)
        return result
    monkeypatch.setattr(disputes, "resolve_dispute", controlled)
    async def connected():
        return False
    async def scenario():
        response = await disputes.resolve_stream(SimpleNamespace(is_disconnected=connected), CASE, code_id=None)
        iterator = response.body_iterator
        try:
            assert await anext(iterator) == ": connected\n\n"
            first = await asyncio.wait_for(anext(iterator), 1)
            assert events(first) == [("step", result.agent_log[0].model_dump(mode="json"))]
            assert not release.is_set()
            release.set()
            final = await asyncio.wait_for(anext(iterator), 1)
            assert events(final) == [("result", result.model_dump(mode="json"))]
        finally:
            release.set()
            await iterator.aclose()
    asyncio.run(scenario())


def test_disconnected_client_does_not_cancel_worker_or_cache(monkeypatch):
    result = resolve_dispute(CASE)
    release, stored = threading.Event(), threading.Event()
    monkeypatch.setattr(settings, "public_demo", True)
    class CompletedCache(dict):
        def __setitem__(self, key, value):
            super().__setitem__(key, value)
            stored.set()
    cache = CompletedCache()
    monkeypatch.setattr(disputes, "_demo_cache", cache)
    def controlled(case, on_step):
        assert release.wait(2)
        for entry in result.agent_log:
            on_step(entry)
        return result
    monkeypatch.setattr(disputes, "resolve_dispute", controlled)
    async def disconnected():
        return True
    async def scenario():
        response = await disputes.resolve_stream(SimpleNamespace(is_disconnected=disconnected), CASE, code_id=None)
        assert [frame async for frame in response.body_iterator] == [": connected\n\n"]
        assert not stored.is_set()
    try:
        asyncio.run(scenario())
    finally:
        release.set()
        assert stored.wait(2)
    assert cache[CASE.dispute_id][1] == result
