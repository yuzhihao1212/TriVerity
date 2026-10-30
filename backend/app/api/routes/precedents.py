"""Learning feedback loop: a human reviewer's decision becomes a precedent.

A reviewer who overrules (or confirms) a ruling posts the case and their decision;
it joins the precedent knowledge base in memory. Similar future disputes then see
it, and if reviewers keep deciding such cases differently from the rules, PREC-1
escalates them to a human. Feedback can only ever cause escalations, never change
a decision, so a bad entry can't move money.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core import limits
from app.core.rate_limit import enforce_write_rate_limit, sandbox_owner
from app.models.dispute import DisputeCase
from app.services.evidence import compute_facts
from app.services.precedents import FeedbackFull, add_feedback
from app.services.text_safety import find_link_or_markup, normalise, sanitise

router = APIRouter(tags=["precedents"])


class ReviewerDecision(BaseModel):
    case: DisputeCase
    # A reviewer's final decision; "needs_review" is not a final decision.
    decision: Literal["partial_refund", "full_refund", "compensation", "no_action"]
    note: str = Field(default="", max_length=limits.PRECEDENT_NOTE_MAX_CHARS)


class FeedbackRecorded(BaseModel):
    id: str
    summary: str
    decision: str


@router.post("/precedents/feedback", response_model=FeedbackRecorded, status_code=201)
def record_feedback(body: ReviewerDecision,
                    code_id: str | None = Depends(enforce_write_rate_limit)) -> FeedbackRecorded:
    """Record a human reviewer's decision as a precedent (internal reviewer console).

    In the public demo this needs a judge access code, and the decision joins only that
    judge's sandbox: it affects that judge's own disputes, never the public samples or other
    judges (two posts could otherwise make a sample escalate, PREC-1, for every visitor).
    Without a code: 403. A real deployment would require a reviewer login (auth tier T3).
    """
    owner = sandbox_owner(code_id)
    note = sanitise(body.note)
    if find_link_or_markup(normalise(note)):
        raise HTTPException(status_code=422, detail="The note must be plain text, without links or markup.")
    try:
        precedent = add_feedback(body.case.type, compute_facts(body.case), body.decision, note, owner=owner)
    except FeedbackFull:
        raise HTTPException(status_code=409, detail="The feedback store is full.") from None
    return FeedbackRecorded(id=precedent.id, summary=precedent.summary, decision=precedent.decision)
