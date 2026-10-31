import asyncio
import queue
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.streaming import SSE_HEADERS, StreamRoute, event

from app.core import limits
from app.core.config import settings
from app.core.rate_limit import charge_resolves, enforce_resolve_rate_limit
from app.models.dispute import DisputeCase, SampleCase
from app.models.resolution import AgentLogEntry, PartyResolution, Resolution
from app.services.budget import budget
from app.services.evidence import analyse_chat
from app.services.llm_client import ai_disabled
from app.services.orchestrator import ServiceBusy, resolve_dispute
from app.services.sample_service import load_samples

router = APIRouter(tags=["disputes"])

# Public demo: dispute_id -> (monotonic time resolved, result).
_demo_cache: dict[str, tuple[float, Resolution]] = {}
_demo_lock = threading.Lock()

@router.get("/disputes/samples", response_model=list[SampleCase])
def samples() -> list[SampleCase]:
    # The same keyword check SAFE-1 rules on, so the queue can tag a threat before any run.
    return [SampleCase(**case.model_dump(), safety_flag=bool(analyse_chat(case.chat_logs).threats)) for case in load_samples()]

@router.post("/disputes/resolve", response_model=Resolution | PartyResolution)
def resolve(
    case: DisputeCase,
    view: Literal["internal", "rider", "driver"] = "internal",
    ai: Literal["on", "off"] = "on",
    code_id: str | None = Depends(enforce_resolve_rate_limit),
) -> Resolution | PartyResolution:
    """Resolve a dispute.

    ``view=internal`` (default) is the full record for the reviewer console;
    ``view=rider`` / ``view=driver`` is what that party may see (finding F8).
    In production the internal view must require a reviewer login (auth tier T3).
    ``ai=off`` resolves without calling the LLM (deterministic fallbacks, no tokens).
    """
    result = _resolve_case(case, code_id, offline=ai == "off")
    return result if view == "internal" else PartyResolution.of(result, case.dispute_id, view)

class BatchResolveRequest(BaseModel):
    dispute_ids: list[str] = Field(min_length=1, max_length=limits.MAX_BATCH_RESOLVE)


class BatchResolveItem(BaseModel):
    """One dispute's result, or why it could not be resolved (the others still run)."""
    dispute_id: str
    result: Resolution | None = None
    status: int | None = None
    error: str | None = None


@router.post("/disputes/resolve/batch", response_model=list[BatchResolveItem])
def resolve_batch(
    body: BatchResolveRequest,
    request: Request,
    ai: Literal["on", "off"] = "on",
) -> list[BatchResolveItem]:
    """Resolve several sample disputes at once: the queue's "Run all".

    Samples only, by ID: each is resolved exactly as a single sample request would be
    (same server-side copy, cache and daily budget), so a batch can't spend more than
    the budget allows. Each case counts against the daily rate limits, as it would run
    alone; the per-minute limits count the batch once, so a reviewer can run the queue
    in one go. Internal view only, like the default single resolve.
    """
    samples = {c.dispute_id: c for c in load_samples()}
    ids = list(dict.fromkeys(body.dispute_ids))
    unknown = [i for i in ids if i not in samples]
    if unknown:
        raise HTTPException(status_code=404, detail="Run all resolves the sample disputes only.")
    code_id = charge_resolves(request, len(ids))

    def one(dispute_id: str) -> BatchResolveItem:
        try:
            result = _resolve_case(samples[dispute_id], code_id, offline=ai == "off")
            return BatchResolveItem(dispute_id=dispute_id, result=result)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else "Resolve request rejected."
            return BatchResolveItem(dispute_id=dispute_id, status=exc.status_code, error=detail)

    with ThreadPoolExecutor(max_workers=limits.BATCH_RESOLVE_WORKERS) as pool:
        return list(pool.map(one, ids))


StepCallback = Callable[[AgentLogEntry], None]


def _resolve_case(case: DisputeCase, code_id: str | None, on_step: StepCallback | None = None,
                  offline: bool = False) -> Resolution:
    # Both transports use the same server-side sample lookup, cache and budget.
    if settings.public_demo and code_id is None:
        return _resolve_public_sample(case.dispute_id, on_step, offline)
    # A judge's own dispute (public demo) sees that judge's own reviewer decisions too.
    return _run(case, on_step, offline, precedent_owner=code_id if settings.public_demo else None)


def _run(case: DisputeCase, on_step: StepCallback | None = None, offline: bool = False,
         precedent_owner: str | None = None) -> Resolution:
    # Offline runs spend no tokens, so they don't count against the daily resolve budget.
    if not offline:
        budget.record_resolve()
    kwargs = {}
    if on_step is not None:
        kwargs["on_step"] = on_step
    if precedent_owner is not None:
        kwargs["precedent_owner"] = precedent_owner
    try:
        with ai_disabled(offline):
            return resolve_dispute(case, **kwargs)
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


def _resolve_public_sample(dispute_id: str, on_step: StepCallback | None = None, offline: bool = False) -> Resolution:
    """Resolve the server's own copy of a sample; the client's facts and text are ignored."""
    case = next((c for c in load_samples() if c.dispute_id == dispute_id), None)
    if case is None:
        raise HTTPException(status_code=404, detail="The public demo resolves the sample disputes only.")
    if offline:
        # Free and instant; kept out of the cache so an AI request never gets an offline result.
        return _run(case, on_step, offline=True)
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
    ai: Literal["on", "off"] = "on",
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
            result = _resolve_case(case, code_id, on_step=finished, offline=ai == "off")
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
