"""Appeals API: file an appeal, list the queue, record the reviewer's decision.

In the public demo these need a judge access code, and each judge works in a sandbox: their
appeals, queue and the precedents their decisions create are theirs alone, so nobody can fill
another judge's queue or make the public samples escalate for every visitor. Without a code
they are off (403). A real deployment would put the party endpoint behind the rider/driver
login and the reviewer endpoints behind a reviewer login (auth tier T3).
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core import limits
from app.core.rate_limit import enforce_write_rate_limit, read_demo_code, sandbox_owner
from app.models.dispute import DisputeCase
from app.models.resolution import Decision
from app.services.appeals import (
    AlreadyAppealed, AlreadyDecided, Appeal, AppealNotFound, AppealsFull, FinalDecision, decide, file_appeal, list_appeals,
)
from app.services.precedents import FeedbackFull
from app.services.text_safety import contains_link_or_markup, normalise, sanitise

# Writes have their own rate limits (they never call the LLM); reading the queue isn't limited.
router = APIRouter(tags=["appeals"])


class AppealRequest(BaseModel):
    case: DisputeCase
    party: Literal["rider", "driver"]
    reason: str = Field(min_length=1, max_length=limits.APPEAL_REASON_MAX_CHARS)
    original_decision: Decision


class ReviewerDecision(BaseModel):
    decision: FinalDecision   # "needs_review" is not a final decision
    note: str = Field(default="", max_length=limits.PRECEDENT_NOTE_MAX_CHARS)


def _plain(text: str, field: str) -> str:
    text = sanitise(text)
    if not text:
        raise HTTPException(status_code=422, detail=f"The {field} must not be empty.")
    if contains_link_or_markup(normalise(text)):
        raise HTTPException(status_code=422, detail=f"The {field} must be plain text, without links or markup.")
    return text


@router.post("/appeals", response_model=Appeal, status_code=201)
def create_appeal(body: AppealRequest, code_id: str | None = Depends(enforce_write_rate_limit)) -> Appeal:
    """A rider or driver contests a ruling; it joins the human review queue."""
    owner = sandbox_owner(code_id)
    if body.original_decision == "needs_review":
        raise HTTPException(status_code=422, detail="This dispute is already with a human reviewer.")
    try:
        return file_appeal(body.case, body.party, _plain(body.reason, "reason"), body.original_decision, owner=owner)
    except AlreadyAppealed:
        raise HTTPException(status_code=409, detail="This decision has already been appealed by this party.") from None
    except AppealsFull:
        raise HTTPException(status_code=409, detail="The appeals queue is full.") from None


@router.get("/appeals", response_model=list[Appeal])
def appeals_queue(dispute_id: str | None = None, code_id: str | None = Depends(read_demo_code)) -> list[Appeal]:
    """The review queue (reviewer console): safety first, then oldest first; a judge sees their own."""
    return list_appeals(dispute_id, owner=sandbox_owner(code_id))


@router.post("/appeals/{appeal_id}/decision", response_model=Appeal)
def decide_appeal(appeal_id: str, body: ReviewerDecision,
                  code_id: str | None = Depends(enforce_write_rate_limit)) -> Appeal:
    """The reviewer's final decision; it becomes a precedent (learning feedback loop)."""
    owner = sandbox_owner(code_id)
    note = sanitise(body.note)
    if note and contains_link_or_markup(normalise(note)):
        raise HTTPException(status_code=422, detail="The note must be plain text, without links or markup.")
    try:
        return decide(appeal_id, body.decision, note, owner=owner)
    except AppealNotFound:
        raise HTTPException(status_code=404, detail="No such appeal.") from None
    except AlreadyDecided:
        raise HTTPException(status_code=409, detail="This appeal has already been decided.") from None
    except FeedbackFull:
        raise HTTPException(status_code=409, detail="The precedent store is full.") from None
