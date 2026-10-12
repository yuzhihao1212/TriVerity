import threading
import time

from fastapi import APIRouter, Depends, HTTPException

from app.core import limits
from app.core.config import settings
from app.core.rate_limit import enforce_resolve_rate_limit
from app.models.dispute import DisputeCase
from app.models.resolution import Resolution
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

@router.post(
    "/disputes/resolve",
    response_model=Resolution,
    dependencies=[Depends(enforce_resolve_rate_limit)],
)
def resolve(case: DisputeCase) -> Resolution:
    if settings.public_demo:
        return _resolve_public_sample(case.dispute_id)
    return _run(case)

def _run(case: DisputeCase) -> Resolution:
    budget.record_resolve()
    try:
        return resolve_dispute(case)
    except ServiceBusy:
        raise HTTPException(
            status_code=503,
            detail="Busy; try again shortly.",
            headers={"Retry-After": str(limits.BUSY_RETRY_AFTER_S)},
        ) from None

def _resolve_public_sample(dispute_id: str) -> Resolution:
    """Resolve the server's own copy of a sample; the client's facts and text are ignored."""
    case = next((c for c in load_samples() if c.dispute_id == dispute_id), None)
    if case is None:
        raise HTTPException(status_code=404, detail="The public demo resolves the sample disputes only.")
    now = time.monotonic()
    with _demo_lock:
        hit = _demo_cache.get(dispute_id)
    if hit and now - hit[0] < limits.PUBLIC_DEMO_CACHE_S:
        return hit[1]
    result = _run(case)
    with _demo_lock:
        _demo_cache[dispute_id] = (now, result)
    return result
