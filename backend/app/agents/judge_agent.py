from app.models.dispute import DisputeCase
from app.models.resolution import AgentCase, Ruling
from app.services.evidence import CaseFacts
from app.services.policy_service import cite, load_policy

def judge(case: DisputeCase, facts: CaseFacts, rider_case: AgentCase, driver_case: AgentCase) -> Ruling:
    """Policy-grounded judge that decides from computed facts only.

    The advocates' cases are shown alongside the ruling but do not change it:
    narratives can't be verified, facts can. An LLM may later write the
    explanation, but the decision itself should stay rule-based and testable.
    """
    policy = load_policy()
    if case.type == "route_deviation":
        ruling = _judge_route_deviation(case, facts, policy["route_deviation"])
    else:
        ruling = _judge_no_show(case, facts, policy["no_show_charge"])
    return _apply_escalation(ruling, policy["escalation"])

def _judge_route_deviation(case: DisputeCase, facts: CaseFacts, section: dict) -> Ruling:
    evidence = facts.describe()
    excess = facts.distance_excess_ratio
    max_excess = section["thresholds"]["max_distance_excess_ratio"]

    if excess is None:
        return Ruling(
            decision="needs_review",
            recommended_action="Escalate to a human reviewer: route distance data is incomplete.",
            confidence=0.3,
            explanation="Expected and actual trip distance are both required to assess a route deviation.",
            judge_evidence=evidence,
            policy_refs=[cite(section, "RD-4")],
        )

    if excess <= max_excess:
        return Ruling(
            decision="no_action",
            recommended_action="Uphold the fare; no refund.",
            confidence=0.85,
            explanation=f"The route was {excess:.0%} longer than expected, within the {max_excess:.0%} tolerance.",
            judge_evidence=evidence,
            policy_refs=[cite(section, "RD-1")],
        )

    if facts.duration_excess_ratio is not None and facts.duration_excess_ratio <= 0:
        return Ruling(
            decision="no_action",
            recommended_action="Uphold the fare; no refund.",
            confidence=0.7,
            explanation=(
                f"The route was {excess:.0%} longer but no slower than expected, "
                "which is consistent with the driver avoiding congestion."
            ),
            judge_evidence=evidence,
            policy_refs=[cite(section, "RD-2")],
        )

    refund = max(facts.fare_difference or 0.0, 0.0)
    # Without duration data we can't rule out a time-saving detour.
    confidence = 0.8 if facts.duration_excess_ratio is not None else 0.65
    explanation = f"The route was {excess:.0%} longer than expected"
    if facts.duration_excess_ratio is not None:
        explanation += f" and took {facts.duration_excess_ratio:.0%} longer, so the detour did not save time"
    explanation += "."
    if case.driver_statement:
        explanation += " The driver's explanation is noted but is not supported by the trip data."
    return Ruling(
        decision="partial_refund",
        recommended_action=f"Refund {refund:.2f}, the fare charged above the expected fare.",
        refund_amount=refund,
        confidence=confidence,
        explanation=explanation,
        judge_evidence=evidence,
        policy_refs=[cite(section, "RD-3")],
    )

def _judge_no_show(case: DisputeCase, facts: CaseFacts, section: dict) -> Ruling:
    evidence = facts.describe()
    thresholds = section["thresholds"]
    distance = facts.driver_distance_from_pickup_m
    wait = facts.driver_wait_min
    fee = case.fare.cancellation_fee

    def refund(rule_id: str, reason: str, confidence: float) -> Ruling:
        return Ruling(
            decision="full_refund",
            recommended_action=f"Refund the no-show fee{f' of {fee:.2f}' if fee is not None else ''}.",
            refund_amount=fee,
            confidence=confidence,
            explanation=reason,
            judge_evidence=evidence,
            policy_refs=[cite(section, rule_id)],
        )

    if distance is not None and distance > thresholds["max_pickup_distance_m"]:
        return refund(
            "NS-1",
            f"The driver arrived {distance:.0f} m from the pickup point, beyond the "
            f"{thresholds['max_pickup_distance_m']} m limit.",
            0.85,
        )

    if distance is None or wait is None:
        missing = "arrival location" if distance is None else "waiting time"
        return Ruling(
            decision="needs_review",
            recommended_action=f"Escalate to a human reviewer: the driver's {missing} is missing.",
            confidence=0.4,
            explanation=f"The no-show fee can't be verified without the driver's {missing}.",
            judge_evidence=evidence,
            policy_refs=[cite(section, "NS-4")],
        )

    if wait < thresholds["min_wait_min"]:
        return refund(
            "NS-2",
            f"The driver waited {wait:g} min, less than the required {thresholds['min_wait_min']} min.",
            0.8,
        )

    if not facts.driver_contact_attempted:
        return refund("NS-3", "The driver did not try to contact the rider before charging the fee.", 0.7)

    return Ruling(
        decision="no_action",
        recommended_action="Uphold the no-show fee.",
        confidence=0.85,
        explanation=(
            f"The driver arrived {distance:.0f} m from pickup, waited {wait:g} min "
            "and contacted the rider, so the fee is justified."
        ),
        judge_evidence=evidence,
        policy_refs=[cite(section, r) for r in ("NS-1", "NS-2", "NS-3")],
    )

def _apply_escalation(ruling: Ruling, section: dict) -> Ruling:
    if ruling.decision == "needs_review" or ruling.confidence >= section["thresholds"]["min_confidence"]:
        return ruling
    return ruling.model_copy(update={
        "decision": "needs_review",
        "recommended_action": f"Escalate to a human reviewer (proposed: {ruling.recommended_action})",
        "policy_refs": [*ruling.policy_refs, cite(section, "ESC-1")],
    })
