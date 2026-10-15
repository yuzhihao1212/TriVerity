import asyncio
import queue
import threading
import time
from collections.abc import Callable
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.api.streaming import SSE_HEADERS, StreamRoute, event

from app.core import limits
from app.core.config import settings
from app.core.rate_limit import enforce_resolve_rate_limit
from app.models.dispute import DisputeCase
from app.models.resolution import AgentLogEntry, PartyResolution, Resolution
from app.services.budget import budget
from app.services.orchestrator import ServiceBusy, resolve_dispute
from app.services.sample_service import load_samples

router = APIRouter(tags=["disputes"])

# Public demo: dispute_id -> (monotonic time resolved, result).
_demo_cache: dict[str, tuple[float, Resolution]] = {}
_demo_lock = threading.Lock()

@router.get("/disputes/samples", response_model=list[DisputeCase])
def samples() -> list[DisputeCase]:
    return load_samples()

@router.post("/disputes/resolve", response_model=Resolution | PartyResolution)
def resolve(
    case: DisputeCase,
    view: Literal["internal", "rider", "driver"] = "internal",
    code_id: str | None = Depends(enforce_resolve_rate_limit),
) -> Resolution | PartyResolution:
    """Resolve a dispute.

    ``view=internal`` (default) is the full record for the reviewer console;
    ``view=rider`` / ``view=driver`` is what that party may see (finding F8).
    In production the internal view must require a reviewer login (auth tier T3).
    """
    result = _resolve_case(case, code_id)
    return result if view == "internal" else PartyResolution.of(result, case.dispute_id, view)

StepCallback = Callable[[AgentLogEntry], None]


def _resolve_case(case: DisputeCase, code_id: str | None, on_step: StepCallback | None = None) -> Resolution:
    # Both transports use the same server-side sample lookup, cache and budget.
    if settings.public_demo and code_id is None:
        return _resolve_public_sample(case.dispute_id, on_step)
    return _run(case, on_step)


def _run(case: DisputeCase, on_step: StepCallback | None = None) -> Resolution:
    budget.record_resolve()
    try:
        return resolve_dispute(case) if on_step is None else resolve_dispute(case, on_step=on_step)
    except ServiceBusy:
        raise HTTPException(
            status_code=503,
            detail="Busy; try again shortly.",
            headers={"Retry-After": str(limits.BUSY_RETRY_AFTER_S)},
        ) from None

def _public_demo_cache_ttl(result: Resolution) -> int:
    """Keep a sample for a week only when every language step completed with AI."""
    all_ai = (
        result.explanation_source == "llm"
        and result.evidence_collection.source == "llm"
        and all(
            case.source == "llm"
            and case.rebuttal is not None
            and bool(case.rebuttal.text.strip())
            and case.rebuttal.source == "llm"
            for case in (result.rider_case, result.driver_case)
        )
    )
    return limits.PUBLIC_DEMO_CACHE_S if all_ai else limits.PUBLIC_DEMO_FALLBACK_CACHE_S


def _resolve_public_sample(dispute_id: str, on_step: StepCallback | None = None) -> Resolution:
    """Resolve the server's own copy of a sample; the client's facts and text are ignored."""
    case = next((c for c in load_samples() if c.dispute_id == dispute_id), None)
    if case is None:
        raise HTTPException(status_code=404, detail="The public demo resolves the sample disputes only.")
    now = time.monotonic()
    with _demo_lock:
        hit = _demo_cache.get(dispute_id)
    if hit and now - hit[0] < _public_demo_cache_ttl(hit[1]):
        if on_step is not None:
            for entry in hit[1].agent_log:
                on_step(entry)
        return hit[1]
    result = _run(case, on_step)
    with _demo_lock:
        _demo_cache[dispute_id] = (now, result)
    return result


stream_router = APIRouter(route_class=StreamRoute)


@stream_router.post("/disputes/resolve/stream")
async def resolve_stream(
    request: Request,
    case: DisputeCase,
    view: Literal["internal"] = "internal",
    code_id: str | None = Depends(enforce_resolve_rate_limit),
) -> StreamingResponse:
    """Stream completed internal steps; a disconnect never cancels the resolve.

    Preflight errors keep their HTTP status. Once headers have been sent, an
    error event carries the status instead. The final event is result OR error.
    """
    pending: queue.SimpleQueue[tuple[str, dict]] = queue.SimpleQueue()

    def finished(entry: AgentLogEntry) -> None:
        pending.put(("step", entry.model_dump(mode="json")))

    def run() -> None:
        try:
            result = _resolve_case(case, code_id, on_step=finished)
            pending.put(("result", result.model_dump(mode="json")))
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else "Resolve request rejected."
            pending.put(("error", {"status": exc.status_code, "detail": detail}))
        except Exception:
            # Do not disclose provider errors, case text or other raw values.
            pending.put(("error", {"status": 500, "detail": "Unable to finish the dispute."}))

    # The worker owns the run even after the response generator is cancelled.
    # The orchestrator continues to hold/release its existing resolve slot.
    threading.Thread(target=run, name="resolve-stream", daemon=True).start()

    async def events():
        yield ": connected\n\n"
        while not await request.is_disconnected():
            try:
                name, data = pending.get_nowait()
            except queue.Empty:
                # Never block the ASGI event loop or occupy a server pool thread
                # while waiting for the next agent to finish.
                await asyncio.sleep(0.05)
                continue
            yield event(name, data)
            if name in ("result", "error"):
                break

    return StreamingResponse(events(), media_type="text/event-stream", headers=SSE_HEADERS)


router.include_router(stream_router)
