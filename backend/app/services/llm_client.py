"""Shared LLM client for all agents.

Provides a single ``complete(system, user) -> str`` function that every agent
can call. It talks to any OpenAI-compatible chat-completions endpoint via
httpx, reading provider/model/base-url/API-key from ``app.core.config.settings``.

When no API key is configured the function returns a clearly-marked offline
placeholder instead of raising, so tests and local development work without
credentials.
"""

from __future__ import annotations

import logging
import re
import threading
import time

from collections import deque
from contextlib import contextmanager
from contextvars import ContextVar, copy_context

import httpx

from app.core import limits
from app.core.config import settings
from app.services.budget import budget

logger = logging.getLogger(__name__)

OFFLINE_PLACEHOLDER = (
    "[LLM offline] no llm_api_key configured — returning placeholder response."
)

_CODE_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*\n?(.*?)```\s*$", re.DOTALL)


def _strip_fences(text: str) -> str:
    """Strip ```json ... ``` fences if the model wrapped its output."""
    match = _CODE_FENCE_RE.match(text)
    return match.group(1).strip() if match else text.strip()


def _tokens_used(data: dict, system: str, user: str, reply: str) -> int:
    """Real token count from the response's ``usage``; about 4 chars per token if absent."""
    usage = data.get("usage")
    total = usage.get("total_tokens") if isinstance(usage, dict) else None
    if isinstance(total, int):
        return total
    return (len(system) + len(user) + len(reply)) // 4


# Per-request "AI off" switch (the console's offline mode): every call made while it is set
# returns OFFLINE_PLACEHOLDER, so each agent uses its deterministic fallback and no tokens are
# spent. It's a context variable, so it follows the request into threads started with
# carry_context(); it never leaks into other requests.
_ai_off: ContextVar[bool] = ContextVar("ai_off", default=False)


@contextmanager
def ai_disabled(off: bool = True):
    token = _ai_off.set(off)
    try:
        yield
    finally:
        _ai_off.reset(token)


def carry_context(fn):
    """Wrap fn to run in a copy of the caller's context (for thread pools)."""
    ctx = copy_context()
    return lambda *args, **kwargs: ctx.run(fn, *args, **kwargs)


class LLMBusy(Exception):
    """Too many calls are already waiting for the provider's per-minute limit."""


class RequestPacer:
    """Keeps calls within the provider's per-minute limit by spacing them out.

    Each call books the next free slot and waits for it, in order. One per process, which
    matches the single uvicorn worker in the Dockerfile.
    """

    WINDOW_S = 60

    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self._slots: deque[float] = deque()
        self._lock = threading.Lock()

    def reset(self) -> None:
        with self._lock:
            self._slots.clear()

    def wait_seconds(self, now: float, max_wait: float) -> float:
        """Book a slot and return how long to wait for it; raises LLMBusy if that's over max_wait."""
        with self._lock:
            while self._slots and self._slots[0] <= now - self.WINDOW_S:
                self._slots.popleft()
            slot = now
            if len(self._slots) >= self.per_minute:
                slot = max(now, self._slots[-self.per_minute] + self.WINDOW_S)
            if slot - now > max_wait:
                raise LLMBusy(f"next slot is {slot - now:.0f} s away")
            self._slots.append(slot)
            return slot - now


pacer = RequestPacer(limits.LLM_REQUESTS_PER_MINUTE)


def complete(system: str, user: str, *, max_tokens: int = limits.DEFAULT_MAX_TOKENS) -> str:
    """Send a chat-completions request and return the assistant's text.

    Uses the OpenAI-compatible ``/chat/completions`` endpoint pointed at by
    ``settings.llm_base_url``.  If ``settings.llm_api_key`` is empty, or the daily
    budget (``services.budget``) is spent, returns :data:`OFFLINE_PLACEHOLDER` so
    callers fall back to their deterministic output.

    Requests JSON-mode (``response_format``) so compatible providers return
    parseable JSON, and strips ``\\`\\`\\`json`` code fences from the response.
    ``max_tokens`` bounds the reply. Waits for a slot under the provider's per-minute
    limit (:data:`pacer`). Errors are raised, never retried.
    """
    if _ai_off.get() or not settings.llm_api_key:
        return OFFLINE_PLACEHOLDER
    if budget.exhausted():
        logger.warning("Daily LLM budget spent; using deterministic fallbacks.")
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
        "max_tokens": max_tokens,
    }
    if settings.llm_disable_thinking:
        payload["thinking"] = {"type": "disabled"}

    wait = pacer.wait_seconds(time.monotonic(), limits.LLM_MAX_WAIT_S)
    if wait > 0:
        time.sleep(wait)

    with httpx.Client(timeout=limits.LLM_TIMEOUT_S) as client:
        response = client.post(url, headers=headers, json=payload)
        response.raise_for_status()

    data = response.json()
    reply = data["choices"][0]["message"]["content"]
    budget.add_tokens(_tokens_used(data, system, user, reply if isinstance(reply, str) else ""))
    return _strip_fences(reply)
