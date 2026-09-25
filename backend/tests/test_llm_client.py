import json
from unittest.mock import MagicMock, patch

import pytest

from app.services import llm_client
from app.services.llm_client import OFFLINE_PLACEHOLDER, complete


def _mock_response(content: str = "LLM reply") -> MagicMock:
    """Build a MagicMock that mimics an httpx.Response for OpenAI shape."""
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {
        "choices": [{"message": {"role": "assistant", "content": content}}]
    }
    return resp


@pytest.fixture
def configured_settings(monkeypatch):
    """Simulate a fully-configured provider via the shared settings object."""
    monkeypatch.setattr(llm_client.settings, "llm_api_key", "test-key")
    monkeypatch.setattr(llm_client.settings, "llm_base_url", "https://test.example.com/v1")
    monkeypatch.setattr(llm_client.settings, "llm_model", "test-model")


def test_offline_placeholder_when_no_api_key(monkeypatch):
    monkeypatch.setattr(llm_client.settings, "llm_api_key", "")
    result = complete("you are helpful", "hi")
    assert result == OFFLINE_PLACEHOLDER
    assert "offline" in result.lower()


def test_sends_request_to_chat_completions(configured_settings):
    with patch("app.services.llm_client.httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.return_value = _mock_response("LLM reply")
        mock_client_cls.return_value = mock_client

        result = complete("system prompt", "user prompt")

    assert result == "LLM reply"

    mock_client.post.assert_called_once()
    call = mock_client.post.call_args
    assert call.args[0] == "https://test.example.com/v1/chat/completions"
    headers = call.kwargs["headers"]
    assert headers["Authorization"] == "Bearer test-key"
    payload = call.kwargs["json"]
    assert payload["model"] == "test-model"
    assert payload["messages"] == [
        {"role": "system", "content": "system prompt"},
        {"role": "user", "content": "user prompt"},
    ]


def test_uses_default_base_url_when_not_set(configured_settings, monkeypatch):
    monkeypatch.setattr(llm_client.settings, "llm_base_url", "")
    with patch("app.services.llm_client.httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.return_value = _mock_response("ok")
        mock_client_cls.return_value = mock_client

        complete("s", "u")

    url = mock_client.post.call_args.args[0]
    assert url == "https://api.openai.com/v1/chat/completions"


def test_uses_default_model_when_not_set(configured_settings, monkeypatch):
    monkeypatch.setattr(llm_client.settings, "llm_model", "")
    with patch("app.services.llm_client.httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.return_value = _mock_response("ok")
        mock_client_cls.return_value = mock_client

        complete("s", "u")

    payload = mock_client.post.call_args.kwargs["json"]
    assert payload["model"] == "gpt-4o-mini"


def test_raises_on_http_error(configured_settings):
    import httpx

    with patch("app.services.llm_client.httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        error_resp = MagicMock()
        error_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "error", request=MagicMock(), response=MagicMock()
        )
        mock_client.post.return_value = error_resp
        mock_client_cls.return_value = mock_client

        with pytest.raises(httpx.HTTPStatusError):
            complete("s", "u")
