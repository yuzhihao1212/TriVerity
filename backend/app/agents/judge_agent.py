from app.agents._advocate import evidence_index
from app.agents.judge_narration import narrate
from app.agents.precedent_agent import check_consistency
from app.models.dispute import DisputeCase
from app.models.resolution import AgentCase, PartyMessage, PrecedentReport, RiskAssessment, Ruling, RulingCondition
from app.services.evidence import CaseFacts
from app.services.policy_service import cite, load_policy

def _condition(rule: str, label: str, met: bool, value: str,
               facts: CaseFacts | None = None, prefixes: tuple[str, ...] = ()) -> RulingCondition:
    # Resolve exact existing facts, never assume an ID's position within a source.
    ids = [fact_id for fact_id, (_, text) in evidence_index(facts).items()
           if prefixes and text.startswith(prefixes)] if facts is not None else []
    return RulingCondition(rule=rule, label=label, met=met, value=value, fact_ids=ids)


def _record(ruling: Ruling, condition: RulingCondition) -> Ruling:
    return ruling.model_copy(update={"conditions": [*(ruling.conditions or []), condition]})

def judge(
    case: DisputeCase,
    facts: CaseFacts,
    rider_case: AgentCase,
    driver_case: AgentCase,
    risk: RiskAssessment,
    precedents: PrecedentReport | None = None,
) -> Ruling:
    """Policy-grounded judge that decides from computed facts only (see judge_with_precedents)."""
    return judge_with_precedents(case, facts, rider_case, driver_case, risk, precedents)[0]

def judge_with_precedents(
    case: DisputeCase,
    facts: CaseFacts,
    rider_case: AgentCase,
    driver_case: AgentCase,
    risk: RiskAssessment,
    precedents: PrecedentReport | None = None,
) -> tuple[Ruling, PrecedentReport]:
    """The ruling, and the precedent report with its consistency verdict.

    The advocates' cases do not change the decision: narratives can't be
    verified, facts can. Precedents can only escalate (PREC-1), never decide.
    The LLM then explains the ruling and answers both advocates (see
    judge_narration); the decision itself stays rule-based.
    """
    policy = load_policy()
    ruling = base_ruling(case, facts)
    report, overrides = check_consistency(precedents or PrecedentReport(), ruling.decision)
    ruling = _apply_safety(ruling, facts, policy["safety"])
    ruling = _apply_fraud(ruling, risk, policy["fraud"], facts)
    ruling = _apply_precedent(ruling, overrides, policy["precedent"])
    ruling = _apply_escalation(ruling, policy["escalation"])
    ruling = _cap_refund(ruling, case, policy["refund"])
    ruling = ruling.model_copy(update={"judge_evidence_ids": evidence_ids_for(ruling.judge_evidence, facts),
                                      "min_confidence": policy["escalation"]["thresholds"]["min_confidence"]})
    return finish_party_messages(narrate(case, _explain_to_parties(ruling), rider_case, driver_case, report)), report

def evidence_ids_for(lines: list[str], facts: CaseFacts) -> list[str]:
    """The fact ID of each evidence line, so every fact shows its ID, not only the ones an advocate cited.

    The lines come from facts.describe(), which lists the facts in evidence_index's order. If the two
    ever disagree, send no IDs rather than pair a line with the wrong ID.
    """
    index = evidence_index(facts)
    if [line for _, line in index.values()] != lines:
        return []
    return list(index)

def base_ruling(case: DisputeCase, facts: CaseFacts) -> Ruling:
    """The dispute-type rules alone, before any escalation (also builds the precedent set)."""
    policy = load_policy()
    if case.type == "route_deviation":
        return _judge_route_deviation(case, facts, policy["route_deviation"])
    return _judge_no_show(case, facts, policy["no_show_charge"])

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

    conditions = [_condition("RD-4", "Expected and actual route distances available", excess is not None,
                             "Available" if excess is not None else "Missing route distance data",
                             facts, ("Route was ",))]
    if excess is None:
        return Ruling(
            conditions=conditions,
            decision="needs_review",
            recommended_action="Escalate to a human reviewer: route distance data is incomplete.",
            confidence=0.3,
            explanation="Expected and actual trip distance are both required to assess a route deviation.",
            judge_evidence=evidence,
            policy_refs=[cite(section, "RD-4")],
        )

    conditions.append(_condition("RD-1", f"Route within the {max_excess:.0%} distance tolerance",
                                 excess <= max_excess, f"{excess:+.0%} vs planned distance",
                                 facts, ("Route was ",)))
    if excess <= max_excess:
        return Ruling(
            conditions=conditions,
            decision="no_action",
            recommended_action="Uphold the fare; no refund.",
            confidence=0.85,
            explanation=f"The route was {excess:.0%} longer than expected, within the {max_excess:.0%} tolerance.",
            judge_evidence=evidence,
            policy_refs=[cite(section, "RD-1")],
        )

    duration = facts.duration_excess_ratio
    conditions.append(_condition("RD-2", "Longer route took no longer than planned",
                                 duration is not None and duration <= 0,
                                 f"{duration:+.0%} vs planned duration" if duration is not None else "Duration data unavailable; no time saving established",
                                 facts, ("Trip took ",)))
    if facts.duration_excess_ratio is not None and facts.duration_excess_ratio <= 0:
        return Ruling(
            conditions=conditions,
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

    # RD-3 is reached only after the distance and time-saving branches above.
    # Missing duration keeps the existing lower-confidence refund, not a claim
    # that the trip was slower.
    conditions.append(_condition("RD-3", f"Route more than {max_excess:.0%} longer with no recorded time saving",
                                 True, f"{excess:+.0%} vs planned distance; " +
                                 (f"{duration:+.0%} vs planned duration" if duration is not None else "duration unavailable"),
                                 facts, ("Route was ", "Trip took ")))
    refund = max(facts.fare_difference or 0.0, 0.0)
    # Without duration data we can't rule out a time-saving detour.
    confidence = 0.8 if facts.duration_excess_ratio is not None else 0.65
    explanation = f"The route was {excess:.0%} longer than expected"
    if facts.duration_excess_ratio is not None:
        explanation += f" and took {facts.duration_excess_ratio:.0%} longer, so the detour did not save time"
    explanation += "."
    if case.driver_statement:
        explanation += " The driver's explanation is noted but is not supported by the trip data."
    stop = longest_stop_min(facts)
    stop_threshold = section["thresholds"]["min_compensation_stop_min"]
    credit = section["thresholds"]["compensation_credit"]
    conditions.append(_condition("RD-5", f"Unexpected stop of {stop_threshold:g} min or more (adds a ${credit:.2f} credit)",
                                 stop is not None and stop >= stop_threshold,
                                 f"{stop:g} min" if stop is not None else "No unexpected stop recorded",
                                 facts, (f"Unexpected stop: {stop:g} min at ",) if stop is not None else ()))
    if stop is not None and stop >= section["thresholds"]["min_compensation_stop_min"]:
        return Ruling(
            conditions=conditions,
            decision="compensation",
            recommended_action=(f"Refund ${refund:.2f}, the fare charged above the expected fare, plus a "
                                f"${credit:.2f} credit for the lost time."),
            refund_amount=round(refund + credit, 2),
            confidence=confidence,
            explanation=explanation + f" The trip also included an unexpected stop of {stop:g} minutes.",
            judge_evidence=evidence,
            policy_refs=[cite(section, "RD-3"), cite(section, "RD-5")],
        )
    return Ruling(
        conditions=conditions,
        decision="partial_refund",
        recommended_action=f"Refund ${refund:.2f}, the fare charged above the expected fare.",
        refund_amount=refund,
        confidence=confidence,
        explanation=explanation,
        judge_evidence=evidence,
        policy_refs=[cite(section, "RD-3")],
    )

def longest_stop_min(facts: CaseFacts) -> float | None:
    """The longest unexpected mid-trip stop in the GPS data, if any."""
    stops = facts.gps.unexpected_stops if facts.gps else None
    return max((s.duration_min for s in stops), default=None) if stops else None

def _judge_no_show(case: DisputeCase, facts: CaseFacts, section: dict) -> Ruling:
    evidence = facts.describe()
    thresholds = section["thresholds"]
    distance = facts.driver_distance_from_pickup_m
    wait = facts.driver_wait_min
    fee = case.fare.cancellation_fee
    conditions: list[RulingCondition] = []

    def refund(rule_id: str, reason: str, confidence: float) -> Ruling:
        return Ruling(
            conditions=conditions,
            decision="full_refund",
            recommended_action=f"Refund the no-show fee{f' of ${fee:.2f}' if fee is not None else ''}.",
            refund_amount=fee,
            confidence=confidence,
            explanation=reason,
            judge_evidence=evidence,
            policy_refs=[cite(section, rule_id)],
        )

    conditions.append(_condition("NS-1", f"Driver arrived within {thresholds['max_pickup_distance_m']:g} m of pickup",
                                 distance is not None and distance <= thresholds["max_pickup_distance_m"],
                                 f"{distance:.0f} m from pickup" if distance is not None else "Arrival location unavailable",
                                 facts, ("Driver arrived ",)))
    if distance is not None and distance > thresholds["max_pickup_distance_m"]:
        return refund(
            "NS-1",
            f"The driver arrived {distance:.0f} m from the pickup point, beyond the "
            f"{thresholds['max_pickup_distance_m']} m limit.",
            0.85,
        )

    conditions.append(_condition("NS-4", "Arrival location and waiting time available",
                                 distance is not None and wait is not None,
                                 f"Location {'available' if distance is not None else 'missing'}; waiting time {'available' if wait is not None else 'missing'}",
                                 facts, ("Driver arrived ", "Driver waited ")))
    if distance is None or wait is None:
        missing = "arrival location" if distance is None else "waiting time"
        return Ruling(
            conditions=conditions,
            decision="needs_review",
            recommended_action=f"Escalate to a human reviewer: the driver's {missing} is missing.",
            confidence=0.4,
            explanation=f"The no-show fee can't be verified without the driver's {missing}.",
            judge_evidence=evidence,
            policy_refs=[cite(section, "NS-4")],
        )

    conditions.append(_condition("NS-2", f"Driver waited at least {thresholds['min_wait_min']:g} min",
                                 wait >= thresholds["min_wait_min"], f"{wait:g} min",
                                 facts, ("Driver waited ",)))
    if wait < thresholds["min_wait_min"]:
        return refund(
            "NS-2",
            f"The driver waited {wait:g} min, less than the required {thresholds['min_wait_min']} min.",
            0.8,
        )

    conditions.append(_condition("NS-3", "Driver tried to contact the rider through in-app chat",
                                 facts.driver_contact_attempted,
                                 "Contact attempted" if facts.driver_contact_attempted else "No contact attempt recorded",
                                 facts, ("Driver contacted rider via in-app chat", "No driver contact attempt in chat log")))
    if not facts.driver_contact_attempted:
        return refund("NS-3", "The driver did not try to contact the rider before charging the fee.", 0.7)

    return Ruling(
        conditions=conditions,
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
    ruling = _record(ruling, _condition("SAFE-1", "Threatening message in the chat log", bool(facts.chat.threats),
                                       f"{len(facts.chat.threats)} threatening message{'s' if len(facts.chat.threats) != 1 else ''}" if facts.chat.threats else "No threatening messages detected",
                                       facts, ("Threatening message: ",)))
    if not facts.chat.threats:
        return ruling
    return _escalate(ruling, cite(section, "SAFE-1"), "The chat log contains a threatening message.")

def _apply_fraud(ruling: Ruling, risk: RiskAssessment, section: dict, facts: CaseFacts | None = None) -> Ruling:
    ruling = _record(ruling, _condition("FRAUD-1", "Either party has high bad-faith risk",
                                       risk.rider_risk == "high" or risk.driver_risk == "high",
                                       f"Rider: {risk.rider_risk}; driver: {risk.driver_risk}",
                                       facts, ("Rider history:", "Driver history:", "Driver arrived ", "Driver waited ",
                                               "Driver contacted rider via in-app chat", "No driver contact attempt in chat log")))
    if risk.rider_risk != "high" and risk.driver_risk != "high":
        return ruling
    high = [p for p, r in (("rider", risk.rider_risk), ("driver", risk.driver_risk)) if r == "high"]
    return _escalate(
        ruling,
        cite(section, "FRAUD-1"),
        f"The {' and '.join(high)} {'show' if len(high) > 1 else 'shows'} a high bad-faith risk.",
    )

def _apply_precedent(ruling: Ruling, overrides: list[str], section: dict) -> Ruling:
    thresholds = section["thresholds"]
    ruling = _record(ruling, _condition("PREC-1",
                                       f"At least {thresholds['min_human_overrides']} contrary reviewer precedents at {thresholds['min_similarity']:.0%} similarity or above",
                                       bool(overrides),
                                       ", ".join(overrides) if overrides else "Not enough contrary reviewer precedents"))
    if not overrides:
        return ruling
    return _escalate(
        ruling,
        cite(section, "PREC-1"),
        f"Human reviewers decided similar past disputes differently ({', '.join(overrides)}).",
    )

def _apply_escalation(ruling: Ruling, section: dict) -> Ruling:
    threshold = section["thresholds"]["min_confidence"]
    already_review = ruling.decision == "needs_review"
    ruling = _record(ruling, _condition("ESC-1", f"Automatic ruling needs escalation below {threshold:.0%} confidence",
                                       not already_review and ruling.confidence < threshold,
                                       "Already needs human review; confidence check skipped" if already_review
                                       else f"{ruling.confidence:.0%} confidence"))
    if ruling.decision == "needs_review" or ruling.confidence >= section["thresholds"]["min_confidence"]:
        return ruling
    return _escalate(ruling, cite(section, "ESC-1"))

# Customer-service wording for the parties (round 8 item 12). Only facts the case or the
# policy give: no refund timing, rating, earnings-change or appeal-deadline promises until
# the team confirms them, and no names (the case data has none).
_GREETING = {
    "rider": "Hi there, thanks for getting in touch about your trip.",
    "driver": "Hi there, thanks for your patience while we looked into the rider's dispute.",
}
# The judge's case-record sentences, made neutral for the parties: no verdict words about
# either side, and nothing that talks about a party in the third person to that party.
_PARTY_REASON_EDITS = (
    (" The driver's explanation is noted but is not supported by the trip data.", ""),
    ("so the fee is justified", "so the no-show fee applies"),
)
# Escalations whose reason is only missing trip data: safe to tell the parties why.
_MISSING_DATA_RULES = ("RD-4", "NS-4")


def _party_reason(text: str) -> str:
    for old, new in _PARTY_REASON_EDITS:
        text = text.replace(old, new)
    return text.strip()


def _explain_to_parties(ruling: Ruling) -> Ruling:
    """Word the ruling for each party: a greeting, what we found, and what happens now.

    The template is the baseline; the narration (an LLM) may rewrite only "what we found",
    and finish_party_messages() then joins the parts. Fraud/bad-faith signals never appear in
    the messages to either party; they are internal evidence only. An escalated case tells
    the parties only that a person will look at it (plus which trip data is missing, when
    that is the only reason), never the proposed outcome.
    """
    amount = f"${ruling.refund_amount:.2f}" if ruling.refund_amount is not None else None
    reason = _party_reason(ruling.explanation)
    refs = [ref.split(":", 1)[0].strip() for ref in ruling.policy_refs]
    match ruling.decision:
        case "partial_refund" | "full_refund":
            back = f"{amount} back" if amount else "a refund"
            found = {"rider": f"We've looked into your trip and you're getting {back}. {reason}",
                     "driver": f"We've looked into the trip, and the rider is getting {back}. {reason}"}
            next_ = {"rider": "The refund goes back to your original payment method.",
                     "driver": "You don't need to do anything."}
        case "compensation":
            what = f"{amount}: the extra fare back plus a credit for the lost time" if amount else "the extra fare back plus a credit for the lost time"
            found = {"rider": f"We've looked into your trip and you're getting {what}. {reason}",
                     "driver": f"We've looked into the trip, and the rider is getting {what}. {reason}"}
            next_ = {"rider": "The fare refund goes back to your original payment method, and the credit is added to your account.",
                     "driver": "You don't need to do anything."}
        case "no_action":
            found = {"rider": f"We've looked into your trip, and the charge stays as it is. {reason}",
                     "driver": f"We've looked into the trip, and the charge stays as it is. {reason}"}
            next_ = {"rider": "You don't need to do anything.",
                     "driver": "Your earnings for this trip don't change, and you don't need to do anything."}
        case _:
            only_missing = any(ref in _MISSING_DATA_RULES for ref in refs) \
                and not any(ref.startswith(("SAFE", "FRAUD", "PREC", "ESC")) for ref in refs)
            why = f" {reason}" if only_missing else ""
            found = {"rider": f"We need a closer look at your dispute before we can decide.{why}",
                     "driver": f"We need a closer look at the rider's dispute before we can decide.{why}"}
            next_ = {party: "A member of our team will review it and follow up with you." for party in ("rider", "driver")}
    parts = {party: PartyMessage(greeting=_GREETING[party], found=found[party].strip(), next=next_[party])
             for party in ("rider", "driver")}
    return ruling.model_copy(update={
        "rider_message": parts["rider"], "driver_message": parts["driver"],
        # The narration may replace these with its own "what we found".
        "rider_explanation": parts["rider"].found, "driver_explanation": parts["driver"].found,
    })


def finish_party_messages(ruling: Ruling) -> Ruling:
    """Join each party's greeting, what we found (as narrated) and what happens now."""
    update = {}
    for party in ("rider", "driver"):
        parts: PartyMessage | None = getattr(ruling, f"{party}_message")
        if parts is None:
            continue
        found = getattr(ruling, f"{party}_explanation").strip() or parts.found
        joined = parts.model_copy(update={"found": found})
        update[f"{party}_message"] = joined
        update[f"{party}_explanation"] = " ".join([joined.greeting, joined.found, joined.next])
    return ruling.model_copy(update=update)
