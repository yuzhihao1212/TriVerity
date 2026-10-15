import threading

import pytest

from app.core import limits
from app.core.config import settings
from app.core.rate_limit import limiter
from app.services import orchestrator
from app.services.budget import budget

@pytest.fixture(autouse=True)
def offline_llm(monkeypatch):
    """Keep tests off the real LLM even when backend/.env holds an API key.

    Tests that exercise the client set their own fake key on top of this.
    """
    monkeypatch.setattr(settings, "llm_api_key", "")

@pytest.fixture(autouse=True)
def fresh_limits(monkeypatch):
    """Start every test with empty rate-limit windows, budget and resolve slots.

    The limits themselves are unchanged; tests that check them set a fake clock.
    """
    limiter.reset()
    budget.reset()
    monkeypatch.setattr(
        orchestrator, "resolve_slots", threading.BoundedSemaphore(limits.MAX_CONCURRENT_RESOLVES)
    )


@pytest.fixture(autouse=True)
def no_real_network(monkeypatch):
    """Fail loudly if any test reaches a real HTTP endpoint (e.g. an LLM call nobody mocked).

    TestClient uses its own in-process transport, and tests that exercise llm_client mock
    httpx.Client, so neither is affected.
    """
    import httpx

    def refuse(self, request):
        raise RuntimeError(f"real network call in a test: {request.method} {request.url.host}")

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", refuse)
