from app.agents.judge_narration import narrate
from app.models.dispute import DisputeCase
from app.models.resolution import AgentCase, RiskAssessment, Ruling
from app.services.evidence import CaseFacts
from app.services.policy_service import cite, load_policy

def judge(
    case: DisputeCase,
    facts: CaseFacts,
    rider_case: AgentCase,
    driver_case: AgentCase,
    risk: RiskAssessment,
) -> Ruling:
    """Policy-grounded judge that decides from computed facts only.

    The advocates' cases do not change the decision: narratives can't be
    verified, facts can. The LLM then explains the ruling and answers both
    advocates (see judge_narration); the decision itself stays rule-based.
    """
    policy = load_policy()
    if case.type == "route_deviation":
        ruling = _judge_route_deviation(case, facts, policy["route_deviation"])
    else:
        ruling = _judge_no_show(case, facts, policy["no_show_charge"])
    ruling = _apply_safety(ruling, facts, policy["safety"])
    ruling = _apply_fraud(ruling, risk, policy["fraud"])
    ruling = _apply_escalation(ruling, policy["escalation"])
    ruling = _cap_refund(ruling, case, policy["refund"])
    return narrate(case, _explain_to_parties(ruling), rider_case, driver_case)

def _cap_refund(ruling: Ruling, case: DisputeCase, section: dict | None = None) -> Ruling:
    """REF-1: a refund can never exceed the fare actually charged.

    Defence in depth: input validation already bounds the fare, and the facts
    still come from the client until the server looks cases up itself. When it
    applies, REF-1 is cited in the ruling like any other rule.
    """
    actual = case.fare.actual
    if ruling.refund_amount is None or actual is None or ruling.refund_amount <= actual:
        return ruling
    section = section or load_policy()["refund"]
    action = ruling.recommended_action.replace(f"${ruling.refund_amount:.2f}", f"${actual:.2f}")
    return ruling.model_copy(update={
        "refund_amount": actual,
        "recommended_action": action,
        "policy_refs": [*ruling.policy_refs, cite(section, "REF-1")],
    })

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
        recommended_action=f"Refund ${refund:.2f}, the fare charged above the expected fare.",
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
            recommended_action=f"Refund the no-show fee{f' of ${fee:.2f}' if fee is not None else ''}.",
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

def _escalate(ruling: Ruling, citation: str, reason: str | None = None) -> Ruling:
    # If the ruling is already needs_review, a second escalation wraps the
    # proposed action a second time. Instead, only fold in the new citation
    # and (optionally) prepend the new reason to the explanation.
    if ruling.decision == "needs_review":
        explanation = f"{reason} {ruling.explanation}" if reason else ruling.explanation
        return ruling.model_copy(update={
            "explanation": explanation,
            "policy_refs": [*ruling.policy_refs, citation],
        })
    explanation = f"{reason} {ruling.explanation}" if reason else ruling.explanation
    return ruling.model_copy(update={
        "decision": "needs_review",
        "recommended_action": f"Escalate to a human reviewer (proposed: {ruling.recommended_action})",
        "explanation": explanation,
        "policy_refs": [*ruling.policy_refs, citation],
    })

def _apply_safety(ruling: Ruling, facts: CaseFacts, section: dict) -> Ruling:
    if not facts.chat.threats:
        return ruling
    return _escalate(ruling, cite(section, "SAFE-1"), "The chat log contains a threatening message.")

def _apply_fraud(ruling: Ruling, risk: RiskAssessment, section: dict) -> Ruling:
    if risk.rider_risk != "high" and risk.driver_risk != "high":
        return ruling
    high = [p for p, r in (("rider", risk.rider_risk), ("driver", risk.driver_risk)) if r == "high"]
    return _escalate(
        ruling,
        cite(section, "FRAUD-1"),
        f"The {' and '.join(high)} {'show' if len(high) > 1 else 'shows'} a high bad-faith risk.",
    )

def _apply_escalation(ruling: Ruling, section: dict) -> Ruling:
    if ruling.decision == "needs_review" or ruling.confidence >= section["thresholds"]["min_confidence"]:
        return ruling
    return _escalate(ruling, cite(section, "ESC-1"))

def _explain_to_parties(ruling: Ruling) -> Ruling:
    """Word the ruling for each party. Template baseline; an LLM can rewrite these later.

    Fraud/bad-faith signals never appear in the messages to either party; they
    are internal evidence only. A FRAUD-1 escalation tells the parties only that
    the dispute needs additional review.
    """
    amount = f" ${ruling.refund_amount:.2f}" if ruling.refund_amount is not None else ""
    is_fraud_escalation = any("FRAUD-1" in ref for ref in ruling.policy_refs)
    if is_fraud_escalation:
        rider = (
            "Your dispute needs additional review. A human reviewer will "
            "look into it and follow up with you."
        )
        driver = (
            "This dispute needs additional review. A human reviewer will "
            "look into it and follow up with you."
        )
        return ruling.model_copy(update={"rider_explanation": rider, "driver_explanation": driver})
    reason = ruling.explanation
    match ruling.decision:
        case "partial_refund" | "full_refund":
            rider = f"Your dispute was upheld and you will be refunded{amount}. {reason}"
            driver = f"The rider has been refunded{amount}. {reason}"
        case "compensation":
            rider = f"Your dispute was upheld and you will receive compensation{amount}. {reason}"
            driver = f"The rider will receive compensation{amount}. {reason}"
        case "no_action":
            rider = f"Your dispute was not upheld and the charge stands. {reason}"
            driver = f"The rider's dispute was not upheld; no change to your earnings. {reason}"
        case _:
            rider = f"Your dispute has been passed to a human reviewer, who will contact you. {reason}"
            driver = f"This dispute has been passed to a human reviewer, who will contact you. {reason}"
    return ruling.model_copy(update={"rider_explanation": rider, "driver_explanation": driver})
