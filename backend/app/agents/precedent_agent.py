"""Policy & Precedent agent: similar past rulings, for consistency.

Retrieves the closest past disputes from the precedent knowledge base
(``services/precedents.py``) and compares their outcomes with the decision the policy
rules reach. It never changes a decision: when human reviewers decided close cases
differently, rule PREC-1 escalates the dispute to a human with those precedents, the
same way the Fraud agent's signals can only escalate. The Judge's explanation then
cites the precedents (retrieval-augmented generation in ``judge_narration``).
"""

from __future__ import annotations

from collections import Counter

from app.models.dispute import DisputeCase
from app.models.resolution import Decision, PrecedentMatch, PrecedentReport
from app.services.evidence import CaseFacts
from app.services.policy_service import load_policy
from app.services.precedents import retrieve

_PLAIN = {
    "partial_refund": "a partial refund",
    "full_refund": "a full refund",
    "compensation": "compensation",
    "no_action": "no change to the charge",
    "needs_review": "human review",
}


def consult_precedents(case: DisputeCase, facts: CaseFacts) -> PrecedentReport:
    """Retrieve similar past rulings and the decision most of the close ones reached."""
    matches = retrieve(case.type, facts)
    close = _close(matches)
    votes = Counter(m.decision for m in close).most_common()
    recommended = votes[0][0] if votes and (len(votes) == 1 or votes[0][1] > votes[1][1]) else None
    return PrecedentReport(matches=matches, recommended_decision=recommended)


def check_consistency(report: PrecedentReport, decision: Decision) -> tuple[PrecedentReport, list[str]]:
    """Compare the rules' decision with the precedents.

    Returns the report with ``consistency`` and ``summary`` filled in, and the IDs of
    close reviewer decisions that went the other way when there are enough of them to
    trigger PREC-1 (otherwise an empty list).
    """
    close = _close(report.matches)
    if not close:
        return report.model_copy(update={
            "consistency": "no_precedent",
            "summary": "No closely similar past ruling in the knowledge base.",
        }), []
    # Compensation (RD-5) is the partial refund plus a credit, so refund precedents agree with it.
    same = {"partial_refund", "compensation"} if decision in ("partial_refund", "compensation") else {decision}
    agree = [m for m in close if m.decision in same]
    overrides = [m for m in close if m.decided_by == "human_review" and m.decision not in same]
    min_overrides = load_policy()["precedent"]["thresholds"]["min_human_overrides"]
    ids = ", ".join(m.id for m in close)
    if len(overrides) >= min_overrides:
        consistency, escalate = "overridden", [m.id for m in overrides]
        summary = (f"Human reviewers decided {len(overrides)} of {len(close)} similar past disputes "
                   f"differently ({', '.join(escalate)}): {_PLAIN[overrides[0].decision]}.")
    elif len(agree) == len(close):
        consistency, escalate = "consistent", []
        summary = f"Consistent with {len(close)} similar past ruling{'s' if len(close) > 1 else ''} ({ids})."
    else:
        consistency, escalate = "mixed", []
        summary = f"{len(agree)} of {len(close)} similar past rulings ({ids}) reached the same decision."
    return report.model_copy(update={"consistency": consistency, "summary": summary}), escalate


def _close(matches: list[PrecedentMatch]) -> list[PrecedentMatch]:
    threshold = load_policy()["precedent"]["thresholds"]["min_similarity"]
    return [m for m in matches if m.similarity >= threshold]
