"""What would change the ruling: counterfactual explanations from the policy thresholds.

The rules are deterministic, so for every ruling we can say exactly which facts it turned
on and what outcome a different fact would have given: "if the route had been at most 15%
longer than expected (it was 44% longer), there would be no refund (RD-1)". Each statement
is computed in code from the policy, never by the LLM, and the tests check every one by
changing the facts and re-running the rules.

Internal only, like the rest of the reasoning: the reviewer console shows it, the rider and
driver views don't.
"""

from __future__ import annotations

from app.models.dispute import DisputeCase
from app.models.resolution import Counterfactual, Ruling
from app.services.evidence import CaseFacts
from app.services.policy_service import load_policy

_PLAIN = {
    "partial_refund": "a partial refund of the fare above the expected fare",
    "full_refund": "a full refund of the no-show fee",
    "compensation": "compensation",
    "no_action": "no change to the charge",
    "needs_review": "review by a human",
}

# Escalations that sit on top of the dispute-type rules, and the fact each one turned on.
_OVERLAYS = {
    "SAFE-1": "there had been no threatening message in the chat",
    "FRAUD-1": "neither party had shown a high bad-faith risk",
    "PREC-1": "human reviewers had not decided similar past disputes differently",
}


def what_would_change(case: DisputeCase, facts: CaseFacts, ruling: Ruling) -> list[Counterfactual]:
    from app.agents.judge_agent import base_ruling   # judge_agent imports narration; keep this lazy

    base = base_ruling(case, facts)
    rules = {ref.split(":", 1)[0] for ref in ruling.policy_refs}
    escalated_on_top = ruling.decision == "needs_review" and base.decision != "needs_review"
    out: list[Counterfactual] = []

    overlays = [rule for rule in _OVERLAYS if rule in rules]
    if "ESC-1" in rules:
        overlays.append("ESC-1")
    if escalated_on_top and overlays:
        changes = [_OVERLAYS.get(r) or f"the confidence had been at least 60% (it is {ruling.confidence:.0%})"
                   for r in overlays]
        out.append(Counterfactual(
            change=" and ".join(changes), decision=base.decision,
            rules=[ref.split(":", 1)[0] for ref in base.policy_refs],
            outcome=f"an automatic ruling: {_PLAIN[base.decision]}",
        ))

    flips = _route_flips(facts) if case.type == "route_deviation" else _no_show_flips(facts)
    for flip in flips:
        if escalated_on_top:
            flip = flip.model_copy(update={"outcome": f"{flip.outcome}, for a human reviewer to confirm"})
        out.append(flip)
    return out


def _route_flips(facts: CaseFacts) -> list[Counterfactual]:
    limit = load_policy()["route_deviation"]["thresholds"]["max_distance_excess_ratio"]
    excess, duration = facts.distance_excess_ratio, facts.duration_excess_ratio
    if excess is None:
        return [Counterfactual(
            change="both the expected and the actual trip distance had been recorded",
            decision=None, rules=["RD-1", "RD-2", "RD-3"],
            outcome="an automatic ruling under the route rules instead of human review")]
    if excess <= limit:
        return [_cf(f"the route had been more than {limit:.0%} longer than expected (it was {_pct(excess)}) "
                    "and the trip had also taken longer", "partial_refund", "RD-3")]
    if duration is not None and duration <= 0:
        faster = "it took no longer than expected" if duration == 0 else f"it was {abs(duration):.0%} faster"
        return [_cf(f"the trip had also taken longer than expected ({faster})", "partial_refund", "RD-3")]
    flips = [_cf(f"the route had been at most {limit:.0%} longer than expected (it was {excess:.0%} longer)",
                 "no_action", "RD-1")]
    if duration is not None:
        flips.append(_cf(f"the trip had taken no longer than expected (it was {duration:.0%} slower)",
                         "no_action", "RD-2"))
    return flips


def _no_show_flips(facts: CaseFacts) -> list[Counterfactual]:
    thresholds = load_policy()["no_show_charge"]["thresholds"]
    max_m, min_wait = thresholds["max_pickup_distance_m"], thresholds["min_wait_min"]
    distance, wait, contact = facts.driver_distance_from_pickup_m, facts.driver_wait_min, facts.driver_contact_attempted
    if distance is not None and distance > max_m:
        # Checked first by the rules, so it decides even when the wait is unknown.
        unmet = [f"the driver had stopped within {max_m} m of the pickup point (they stopped {distance:.0f} m away)"]
    elif distance is None or wait is None:
        missing = " and ".join(name for name, value in (("arrival location", distance), ("waiting time", wait))
                               if value is None)
        return [Counterfactual(
            change=f"the driver's {missing} had been recorded",
            decision=None, rules=["NS-1", "NS-2", "NS-3"],
            outcome="an automatic ruling under the no-show rules instead of human review")]
    else:
        unmet = []
    if wait is None:
        unmet.append(f"the driver had waited at least {min_wait} minutes (no waiting time was recorded)")
    elif wait < min_wait:
        unmet.append(f"the driver had waited at least {min_wait} minutes (they waited {wait:g})")
    if not contact:
        unmet.append("the driver had contacted the rider in the app")
    if unmet:   # the fee is refunded today: all unmet conditions together would let it stand
        return [_cf(" and ".join(unmet), "no_action", "NS-1", "NS-2", "NS-3")]
    # The fee stands today: any single condition failing would refund it.
    return [
        _cf(f"the driver had stopped more than {max_m} m from the pickup point (they stopped {distance:.0f} m away)",
            "full_refund", "NS-1"),
        _cf(f"the driver had waited less than {min_wait} minutes (they waited {wait:g})", "full_refund", "NS-2"),
        _cf("the driver had not contacted the rider in the app", "full_refund", "NS-3"),
    ]


def _cf(change: str, decision: str, *rules: str) -> Counterfactual:
    return Counterfactual(change=change, decision=decision, rules=list(rules), outcome=_PLAIN[decision])


def _pct(ratio: float) -> str:
    return f"{abs(ratio):.0%} {'longer' if ratio >= 0 else 'shorter'}"
