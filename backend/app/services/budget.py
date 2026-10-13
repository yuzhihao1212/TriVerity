"""Global daily LLM budget, shared by every caller.

Per-IP limits do not protect the token budget against many IPs; this does.
When the day's tokens or resolves are spent, ``llm_client.complete`` returns the
offline placeholder, so every agent takes its deterministic fallback and the
API still returns a full, correct ruling with Fallback badges.

Counters are in memory and per process: run one uvicorn worker, or move them
to a shared store (e.g. Redis) before scaling out.
"""

import threading
import time

from app.core import limits

_DAY_S = 24 * 3600


class Budget:
    def __init__(self, clock=time.time):
        self.clock = clock
        self._lock = threading.Lock()
        self.reset()

    def reset(self) -> None:
        self.tokens_used = 0
        self.resolves_used = 0
        self._day = self._today()

    def _today(self) -> int:
        return int(self.clock() // _DAY_S)  # UTC day number

    def _roll(self) -> None:
        if self._today() != self._day:
            self.reset()

    def exhausted(self) -> bool:
        with self._lock:
            self._roll()
            return (
                self.tokens_used >= limits.DAILY_TOKEN_BUDGET
                or self.resolves_used > limits.DAILY_RESOLVE_BUDGET
            )

    def record_resolve(self) -> None:
        with self._lock:
            self._roll()
            self.resolves_used += 1

    def add_tokens(self, tokens: int) -> None:
        with self._lock:
            self._roll()
            self.tokens_used += max(int(tokens), 0)


budget = Budget()
