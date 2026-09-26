"""Shared LLM client for all agents.

Provides a single ``complete(system, user) -> str`` function that every agent
can call. It talks to any OpenAI-compatible chat-completions endpoint via
httpx, reading provider/model/base-url/API-key from ``app.core.config.settings``.

When no API key is configured the function returns a clearly-marked offline
placeholder instead of raising, so tests and local development work without
credentials.
"""

from __future__ import annotations

import re

import httpx

from app.core.config import settings

OFFLINE_PLACEHOLDER = (
    "[LLM offline] no llm_api_key configured — returning placeholder response."
)

_CODE_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*\n?(.*?)```\s*$", re.DOTALL)


def _strip_fences(text: str) -> str:
    """Strip ```json ... ``` fences if the model wrapped its output."""
    match = _CODE_FENCE_RE.match(text)
    return match.group(1).strip() if match else text.strip()


def complete(system: str, user: str) -> str:
    """Send a chat-completions request and return the assistant's text.

    Uses the OpenAI-compatible ``/chat/completions`` endpoint pointed at by
    ``settings.llm_base_url``.  If ``settings.llm_api_key`` is empty, returns
    :data:`OFFLINE_PLACEHOLDER` so callers (and tests) can run without a key.

    Requests JSON-mode (``response_format``) so compatible providers return
    parseable JSON, and strips ``\\`\\`\\`json`` code fences from the response.
    """
    if not settings.llm_api_key:
        return OFFLINE_PLACEHOLDER

    base_url = settings.llm_base_url or "https://api.openai.com/v1"
    url = f"{base_url.rstrip('/')}/chat/completions"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.llm_api_key}",
    }
    payload = {
        "model": settings.llm_model or "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
    }
    if settings.llm_disable_thinking:
        payload["thinking"] = {"type": "disabled"}

    with httpx.Client(timeout=60) as client:
        response = client.post(url, headers=headers, json=payload)
        response.raise_for_status()

    data = response.json()
    return _strip_fences(data["choices"][0]["message"]["content"])
