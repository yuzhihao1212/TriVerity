"""Appeals API: file an appeal, list the queue, record the reviewer's decision.

Off in the public demo, like reviewer feedback: anyone with the link could otherwise fill
the queue or turn reviewer decisions into precedents that escalate samples for every
visitor. A real deployment would put the party endpoint behind the rider/driver login and
the reviewer endpoints behind a reviewer login (auth tier T3).
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core import limits
from app.core.config import settings
from app.core.rate_limit import enforce_write_rate_limit
from app.models.dispute import DisputeCase
from app.models.resolution import Decision
from app.services.appeals import (
    AlreadyAppealed, AlreadyDecided, Appeal, AppealNotFound, AppealsFull, FinalDecision, decide, file_appeal, list_appeals,
)
from app.services.precedents import FeedbackFull
from app.services.text_safety import contains_link_or_markup, normalise, sanitise

# Writes have their own rate limits (they never call the LLM); reading the queue isn't limited.
router = APIRouter(tags=["appeals"])
_LIMITED = [Depends(enforce_write_rate_limit)]


class AppealRequest(BaseModel):
    case: DisputeCase
    party: Literal["rider", "driver"]
    reason: str = Field(min_length=1, max_length=limits.APPEAL_REASON_MAX_CHARS)
    original_decision: Decision


class ReviewerDecision(BaseModel):
    decision: FinalDecision   # "needs_review" is not a final decision
    note: str = Field(default="", max_length=limits.PRECEDENT_NOTE_MAX_CHARS)


def _off_in_public_demo() -> None:
    if settings.public_demo:
        raise HTTPException(status_code=403, detail="Appeals are turned off in the public demo.")


def _plain(text: str, field: str) -> str:
    text = sanitise(text)
    if not text:
        raise HTTPException(status_code=422, detail=f"The {field} must not be empty.")
    if contains_link_or_markup(normalise(text)):
        raise HTTPException(status_code=422, detail=f"The {field} must be plain text, without links or markup.")
    return text


@router.post("/appeals", response_model=Appeal, status_code=201, dependencies=_LIMITED)
def create_appeal(body: AppealRequest) -> Appeal:
    """A rider or driver contests a ruling; it joins the human review queue."""
    _off_in_public_demo()
    if body.original_decision == "needs_review":
        raise HTTPException(status_code=422, detail="This dispute is already with a human reviewer.")
    try:
        return file_appeal(body.case, body.party, _plain(body.reason, "reason"), body.original_decision)
    except AlreadyAppealed:
        raise HTTPException(status_code=409, detail="This decision has already been appealed by this party.") from None
    except AppealsFull:
        raise HTTPException(status_code=409, detail="The appeals queue is full.") from None


@router.get("/appeals", response_model=list[Appeal])
def appeals_queue(dispute_id: str | None = None) -> list[Appeal]:
    """The review queue (reviewer console): safety first, then oldest first."""
    _off_in_public_demo()
    return list_appeals(dispute_id)


@router.post("/appeals/{appeal_id}/decision", response_model=Appeal, dependencies=_LIMITED)
def decide_appeal(appeal_id: str, body: ReviewerDecision) -> Appeal:
    """The reviewer's final decision; it becomes a precedent (learning feedback loop)."""
    _off_in_public_demo()
    note = sanitise(body.note)
    if note and contains_link_or_markup(normalise(note)):
        raise HTTPException(status_code=422, detail="The note must be plain text, without links or markup.")
    try:
        return decide(appeal_id, body.decision, note)
    except AppealNotFound:
        raise HTTPException(status_code=404, detail="No such appeal.") from None
    except AlreadyDecided:
        raise HTTPException(status_code=409, detail="This appeal has already been decided.") from None
    except FeedbackFull:
        raise HTTPException(status_code=409, detail="The precedent store is full.") from None
