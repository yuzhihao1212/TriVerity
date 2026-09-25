from fastapi import APIRouter

from app.models.dispute import DisputeCase
from app.models.resolution import Resolution
from app.services.orchestrator import resolve_dispute

router = APIRouter(tags=["disputes"])

@router.post("/disputes/resolve", response_model=Resolution)
def resolve(case: DisputeCase) -> Resolution:
    return resolve_dispute(case)
