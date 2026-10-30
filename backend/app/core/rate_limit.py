"""Sliding-window rate limits for POST /api/disputes/resolve, and separately for reviewer/party writes.

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

    def hit(self, rules: list[tuple[str, int, int] | tuple[str, int, int, int]]) -> float | None:
        """Record hits against every ``(key, limit, window_s[, cost])`` rule (cost defaults to 1).

        Returns None if allowed, else the seconds until the tightest full window
        frees enough slots (and records nothing). A cost above the limit can never fit,
        so it waits a whole window.
        """
        now = self.clock()
        with self._lock:
            waits = []
            for key, limit, window, *rest in rules:
                cost = rest[0] if rest else 1
                hits = self._hits[(key, window)]
                while hits and hits[0] <= now - window:
                    hits.popleft()
                if len(hits) + cost > limit:
                    if cost > limit:
                        waits.append(float(window))
                    else:
                        waits.append(hits[len(hits) + cost - limit - 1] + window - now)
            if waits:
                return max(waits)
            for key, _, window, *rest in rules:
                self._hits[(key, window)].extend([now] * (rest[0] if rest else 1))
            return None


limiter = RateLimiter()


def enforce_resolve_rate_limit(request: Request) -> str | None:
    """FastAPI dependency for the resolve endpoint.

    Returns the access-code ID when a valid X-Demo-Key was sent (and limits per
    code), else None (and limits per IP).
    """
    return charge_resolves(request, 1)


def charge_resolves(request: Request, cases: int) -> str | None:
    """Count ``cases`` resolves against the daily limits and one request against the per-minute ones.

    A batch ("Run all") therefore can't do more in a day than the same cases run one by
    one, while still fitting the per-minute limit as a single request.
    """
    code_id = verify_demo_code(request.headers.get(DEMO_KEY_HEADER))
    if code_id:
        rules = [
            (f"code:{code_id}", limits.PER_CODE_PER_MINUTE, _MINUTE),
            (f"code:{code_id}", limits.PER_CODE_PER_DAY, _DAY, cases),
        ]
    else:
        ip = request.client.host if request.client else "unknown"
        rules = [
            (f"ip:{ip}", limits.PER_IP_PER_MINUTE, _MINUTE),
            (f"ip:{ip}", limits.PER_IP_PER_DAY, _DAY, cases),
        ]
    wait = limiter.hit([*rules, ("global", limits.GLOBAL_PER_MINUTE, _MINUTE)])
    if wait is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many requests; try again later.",
            headers={"Retry-After": str(max(1, math.ceil(wait)))},
        )
    return code_id


def enforce_write_rate_limit(request: Request) -> None:
    """FastAPI dependency for reviewer and party writes (appeals, appeal decisions, feedback).

    Separate counters from resolve: these writes never call the LLM, so they must not use up
    the resolve limits, but they are still limited per IP so the in-memory stores can't be flooded.
    """
    ip = request.client.host if request.client else "unknown"
    wait = limiter.hit([
        (f"writes-ip:{ip}", limits.WRITES_PER_IP_PER_MINUTE, _MINUTE),
        (f"writes-ip:{ip}", limits.WRITES_PER_IP_PER_DAY, _DAY),
    ])
    if wait is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many requests; try again later.",
            headers={"Retry-After": str(max(1, math.ceil(wait)))},
        )
