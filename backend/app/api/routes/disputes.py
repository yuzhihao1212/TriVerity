from fastapi import APIRouter, Depends, HTTPException

from app.core import limits
from app.core.rate_limit import enforce_resolve_rate_limit
from app.models.dispute import DisputeCase
from app.models.resolution import Resolution
from app.services.budget import budget
from app.services.orchestrator import ServiceBusy, resolve_dispute
from app.services.sample_service import load_samples

router = APIRouter(tags=["disputes"])

@router.get("/disputes/samples", response_model=list[DisputeCase])
def samples() -> list[DisputeCase]:
    return load_samples()

@router.post(
    "/disputes/resolve",
    response_model=Resolution,
    dependencies=[Depends(enforce_resolve_rate_limit)],
)
def resolve(case: DisputeCase) -> Resolution:
    budget.record_resolve()
    try:
        return resolve_dispute(case)
    except ServiceBusy:
        raise HTTPException(
            status_code=503,
            detail="Busy; try again shortly.",
            headers={"Retry-After": str(limits.BUSY_RETRY_AFTER_S)},
        ) from None
