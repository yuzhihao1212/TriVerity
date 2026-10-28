"""Appeals: a party contests a ruling, a human reviewer decides, and the decision becomes a precedent.

This closes the product loop: dispute → automatic ruling → appeal → human decision →
precedent knowledge base, which the Policy & Precedent agent checks on similar future
disputes (PREC-1). Appeals are kept in memory like reviewer feedback; a production system
would store them with the dispute queue. The appeal reason is free party text: it is
cleaned, never sent to the LLM, and shown only in the reviewer console.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

from app.core import limits
from app.models.dispute import DisputeCase
from app.models.resolution import Decision
from app.services.evidence import compute_facts
from app.services.precedents import add_feedback

FinalDecision = Literal["partial_refund", "full_refund", "compensation", "no_action"]


class Appeal(BaseModel):
    id: str
    dispute_id: str
    party: Literal["rider", "driver"]
    reason: str
    original_decision: Decision
    # Review order: a threat in the chat goes first, like the triage of escalated disputes.
    priority: Literal["safety", "standard"]
    status: Literal["queued", "decided"] = "queued"
    created_at: datetime
    reviewer_decision: FinalDecision | None = None
    precedent_id: str | None = None   # the precedent the reviewer's decision created


class AppealsFull(Exception):
    """The in-memory appeals store is full."""


class AppealNotFound(Exception):
    pass


class AlreadyDecided(Exception):
    pass


class AlreadyAppealed(Exception):
    """This party already appealed this dispute: one appeal each, and a decided appeal is final."""


_appeals: dict[str, tuple[Appeal, DisputeCase]] = {}
_lock = threading.Lock()


def file_appeal(case: DisputeCase, party: str, reason: str, original_decision: str) -> Appeal:
    facts = compute_facts(case)
    with _lock:
        if any(a.dispute_id == case.dispute_id and a.party == party for a, _ in _appeals.values()):
            raise AlreadyAppealed
        if len(_appeals) >= limits.MAX_APPEALS:
            raise AppealsFull
        appeal = Appeal(
            id=f"A-{len(_appeals) + 1:03d}", dispute_id=case.dispute_id, party=party, reason=reason,
            original_decision=original_decision, priority="safety" if facts.chat.threats else "standard",
            created_at=datetime.now(timezone.utc),
        )
        _appeals[appeal.id] = (appeal, case)
        return appeal


def list_appeals(dispute_id: str | None = None) -> list[Appeal]:
    """Safety first, then oldest first."""
    with _lock:
        found = [a for a, _ in _appeals.values() if dispute_id is None or a.dispute_id == dispute_id]
    return sorted(found, key=lambda a: (a.priority != "safety", a.created_at, a.id))


def decide(appeal_id: str, decision: str, note: str) -> Appeal:
    """Record the reviewer's final decision and add it to the precedent knowledge base."""
    with _lock:
        if appeal_id not in _appeals:
            raise AppealNotFound
        appeal, case = _appeals[appeal_id]
        if appeal.status == "decided":
            raise AlreadyDecided
    # add_feedback has its own lock and capacity check (FeedbackFull).
    precedent = add_feedback(case.type, compute_facts(case), decision, note)
    with _lock:
        decided = appeal.model_copy(update={"status": "decided", "reviewer_decision": decision,
                                            "precedent_id": precedent.id})
        _appeals[appeal_id] = (decided, case)
    return decided


def clear_appeals() -> None:
    with _lock:
        _appeals.clear()
