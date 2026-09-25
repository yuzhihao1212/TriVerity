from fastapi import APIRouter

from app.models.dispute import DisputeCase
from app.models.resolution import Resolution
from app.services.orchestrator import resolve_dispute
from app.services.sample_service import load_samples

router = APIRouter(tags=["disputes"])

@router.get("/disputes/samples", response_model=list[DisputeCase])
def samples() -> list[DisputeCase]:
    return load_samples()

@router.post("/disputes/resolve", response_model=Resolution)
def resolve(case: DisputeCase) -> Resolution:
    return resolve_dispute(case)
