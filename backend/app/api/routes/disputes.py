import threading
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException

from app.core import limits
from app.core.config import settings
from app.core.rate_limit import enforce_resolve_rate_limit
from app.models.dispute import DisputeCase
from app.models.resolution import PartyResolution, Resolution
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
    # In the public demo only access-code holders may submit their own dispute.
    if settings.public_demo and code_id is None:
        result = _resolve_public_sample(case.dispute_id)
    else:
        result = _run(case)
    return result if view == "internal" else PartyResolution.of(result, case.dispute_id, view)

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


def _resolve_public_sample(dispute_id: str) -> Resolution:
    """Resolve the server's own copy of a sample; the client's facts and text are ignored."""
    case = next((c for c in load_samples() if c.dispute_id == dispute_id), None)
    if case is None:
        raise HTTPException(status_code=404, detail="The public demo resolves the sample disputes only.")
    now = time.monotonic()
    with _demo_lock:
        hit = _demo_cache.get(dispute_id)
    if hit and now - hit[0] < _public_demo_cache_ttl(hit[1]):
        return hit[1]
    result = _run(case)
    with _demo_lock:
        _demo_cache[dispute_id] = (now, result)
    return result
