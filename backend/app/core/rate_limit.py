"""Sliding-window rate limits for POST /api/disputes/resolve.

Per IP (minute and day) plus a global per-minute limit across all callers.
Over a limit: 429 with ``Retry-After``. A rejected request does not count.

The client IP is ``request.client.host``. Behind a proxy, start uvicorn with
``--proxy-headers --forwarded-allow-ips=<proxy IP>`` (never ``*`` when the app is
reachable directly, or callers can forge X-Forwarded-For). Counters are in
memory and per process: run one worker, or move them to a shared store.
"""

import math
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.core import limits
from app.core.access import DEMO_KEY_HEADER, verify_demo_code

_MINUTE = 60
_DAY = 24 * 3600


class RateLimiter:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self._lock = threading.Lock()
        self._hits: dict[tuple[str, int], deque[float]] = defaultdict(deque)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def hit(self, rules: list[tuple[str, int, int]]) -> float | None:
        """Record one hit against every ``(key, limit, window_s)`` rule.

        Returns None if allowed, else the seconds until the tightest full window
        frees a slot (and records nothing).
        """
        now = self.clock()
        with self._lock:
            waits = []
            for key, limit, window in rules:
                hits = self._hits[(key, window)]
                while hits and hits[0] <= now - window:
                    hits.popleft()
                if len(hits) >= limit:
                    waits.append(hits[0] + window - now)
            if waits:
                return max(waits)
            for key, _, window in rules:
                self._hits[(key, window)].append(now)
            return None


limiter = RateLimiter()


def enforce_resolve_rate_limit(request: Request) -> str | None:
    """FastAPI dependency for the resolve endpoint.

    Returns the access-code ID when a valid X-Demo-Key was sent (and limits per
    code), else None (and limits per IP).
    """
    code_id = verify_demo_code(request.headers.get(DEMO_KEY_HEADER))
    if code_id:
        rules = [
            (f"code:{code_id}", limits.PER_CODE_PER_MINUTE, _MINUTE),
            (f"code:{code_id}", limits.PER_CODE_PER_DAY, _DAY),
        ]
    else:
        ip = request.client.host if request.client else "unknown"
        rules = [
            (f"ip:{ip}", limits.PER_IP_PER_MINUTE, _MINUTE),
            (f"ip:{ip}", limits.PER_IP_PER_DAY, _DAY),
        ]
    wait = limiter.hit([*rules, ("global", limits.GLOBAL_PER_MINUTE, _MINUTE)])
    if wait is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many requests; try again later.",
            headers={"Retry-After": str(max(1, math.ceil(wait)))},
        )
    return code_id
