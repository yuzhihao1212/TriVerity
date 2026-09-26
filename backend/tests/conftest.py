import pytest

from app.core.config import settings

@pytest.fixture(autouse=True)
def offline_llm(monkeypatch):
    """Keep tests off the real LLM even when backend/.env holds an API key.

    Tests that exercise the client set their own fake key on top of this.
    """
    monkeypatch.setattr(settings, "llm_api_key", "")
