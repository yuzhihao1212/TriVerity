"""Deterministic triage: orders escalated disputes for human reviewers.

Internal only, like the fraud signals: PartyResolution never carries it, so it
can't reach the rider or driver. The tier decides the order (safety always
first); the score only orders cases within a tier. Inputs are the ruling's
cited rules, proposed refund and confidence; weights live in the policy file.
"""
from app.models.resolution import Ruling, Triage
from app.services.policy_service import load_policy

REASONS = {
    "SAFE-1": "Threatening message in chat (SAFE-1)",
    "FRAUD-1": "High bad-faith risk (FRAUD-1)",
    "RD-4": "Route evidence missing (RD-4)",
    "NS-4": "Arrival or waiting evidence missing (NS-4)",
    "ESC-1": "Confidence below the review threshold (ESC-1)",
    "PREC-1": "Reviewers decided similar past disputes differently (PREC-1)",
}


def triage(ruling: Ruling) -> Triage:
    if ruling.decision != "needs_review":
        return Triage()
    policy = load_policy()
    section = policy["triage"]
    weights = section["weights"]
    rules = [ref.split(":", 1)[0].strip() for ref in ruling.policy_refs]
    escalations = [r for r in rules if r in REASONS]

    if "SAFE-1" in escalations:
        tier = "safety"
    elif "FRAUD-1" in escalations:
        tier = "high"
    elif ruling.refund_amount is not None and ruling.refund_amount < section["thresholds"]["low_value_max"]:
        tier = "low"
    else:
        tier = "standard"

    reasons = [REASONS[r] for r in escalations]
    score = sum(weights[r] for r in escalations)
    if ruling.refund_amount:
        value = min(ruling.refund_amount * weights["points_per_dollar_at_stake"], weights["max_value_points"])
        score += value
        reasons.append(f"${ruling.refund_amount:.2f} proposed refund at stake")
    gap = policy["escalation"]["thresholds"]["min_confidence"] - ruling.confidence
    if gap > 0:
        score += gap * 100 * weights["points_per_confidence_point_below_threshold"]
        reasons.append(f"Confidence {ruling.confidence:.0%}")
    return Triage(tier=tier, score=min(round(score), 100), reasons=reasons)

