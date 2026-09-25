from fastapi import APIRouter

from app.models.dispute import DisputeCase
from app.services.orchestrator import resolve_dispute

router = APIRouter(tags=["disputes"])

@router.post("/disputes/resolve")
def resolve(case: DisputeCase):
    return resolve_dispute(case)
