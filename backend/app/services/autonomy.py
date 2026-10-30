"""Deterministic auto-resolve eligibility: can a routine ruling skip the human?

Internal only, like triage: ``PartyResolution`` never carries it, so it can't
reach the rider or driver. The decision is purely from the policy and the
ruling's cited rules, confidence and refund amount — no LLM, no heuristics
that invent data.

A ruling is eligible only when *all* of these hold:

* the policy section is enabled;
* the decision is not ``needs_review`` (escalated cases always go to a human);
* confidence is at or above ``min_confidence`` (which stays above the
  escalation threshold, so a case that *could* be auto-resolved was never
  escalated for low confidence);
* the refund is ``None`` or at most ``min(max_refund, fare)``;
* none of the human-only rules are cited: SAFE-1, FRAUD-1, PREC-1, ESC-1,
  RD-4, NS-4.

The AI's wording needs no separate gate here: the decision and amount always
come from the policy rules, and an explanation that fails the narration checks
(wrong amounts, uncited rules) is already replaced by the deterministic one.

A deterministic ~``audit_rate`` sample of eligible cases is flagged for audit.
The sample uses a stable hash of the dispute id, not ``random()``, so the same
case always gets the same answer and the demo is repeatable. Audited cases
still go to a human.
"""

from __future__ import annotations

import hashlib

from app.models.dispute import DisputeCase
from app.models.resolution import Autonomy, Ruling
from app.services.policy_service import load_policy

# Rules that always require a human. SAFE-1 (safety), FRAUD-1 (bad-faith),
# PREC-1 (precedent override), ESC-1 (low confidence), RD-4 / NS-4 (missing
# evidence). A ruling citing any of these is never auto-resolved.
HUMAN_ONLY_RULES = frozenset({"SAFE-1", "FRAUD-1", "PREC-1", "ESC-1", "RD-4", "NS-4"})


def auto_resolve(ruling: Ruling, case: DisputeCase) -> Autonomy:
    """Decide whether *ruling* can be resolved without a human reviewer."""
    policy = load_policy()
    section = policy["auto_resolve"]
    thresholds = section["thresholds"]

    if not section.get("enabled", False):
        return Autonomy(eligible=False, audit=False, reasons=["Auto-resolve is turned off"])

    reasons: list[str] = []

    if ruling.decision == "needs_review":
        reasons.append("The dispute is escalated to a human reviewer")
    if ruling.confidence < thresholds["min_confidence"]:
        reasons.append(
            f"Confidence {ruling.confidence:.0%} is below the {thresholds['min_confidence']:.0%} minimum"
        )

    max_refund = thresholds["max_refund"]
    fare = case.fare.actual if case.fare.actual is not None else case.fare.cancellation_fee
    cap = min(max_refund, fare) if fare is not None else max_refund
    if ruling.refund_amount is not None and ruling.refund_amount > cap + 1e-9:
        reasons.append(
            f"The ${ruling.refund_amount:.2f} refund exceeds the ${cap:.2f} auto-resolve cap"
        )

    cited = {ref.split(":", 1)[0].strip() for ref in ruling.policy_refs}
    flagged = sorted(HUMAN_ONLY_RULES & cited)
    if flagged:
        reasons.append(f"Cites a human-only rule: {', '.join(flagged)}")

    if reasons:
        return Autonomy(eligible=False, audit=False, reasons=reasons)

    # Why it qualified, with the case's own numbers, for the reviewer's banner.
    met = [
        f"Confidence {ruling.confidence:.0%} (at least {thresholds['min_confidence']:.0%})",
        "No refund" if ruling.refund_amount is None
        else f"${ruling.refund_amount:.2f} refund (at most ${cap:.2f})",
        "No safety, fraud, precedent or missing-evidence flags",
    ]
    if _is_audit_sample(case.dispute_id, thresholds["audit_rate"]):
        return Autonomy(
            eligible=True,
            audit=True,
            reasons=["Selected for audit: a human reviewer will check this one", *met],
        )
    return Autonomy(eligible=True, audit=False, reasons=met)


def _is_audit_sample(dispute_id: str, audit_rate: float) -> bool:
    """Stable, repeatable audit sampling from a hash of the dispute id.

    ``audit_rate`` is a fraction in [0, 1]. The same dispute id always maps to
    the same answer, so the demo is repeatable and no ``random()`` is used.
    """
    if audit_rate <= 0:
        return False
    digest = hashlib.sha256(dispute_id.encode()).digest()
    # First 4 bytes as an unsigned int, scaled to [0, 1).
    bucket = int.from_bytes(digest[:4], "big") / 0xFFFFFFFF
    return bucket < audit_rate
