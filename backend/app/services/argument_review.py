"""How the Judge weighed each side: every rule an advocate cited, checked against the facts.

The decision comes from the policy rules, but the Judge still weighs both cases: for each rule
an advocate cited, the code checks whether its condition holds in that advocate's favour, holds
for the other side, or doesn't apply, and marks the rules that decided the case. Deterministic,
so the same arguments always get the same assessment; internal only.
"""

from __future__ import annotations

from app.models.dispute import DisputeCase
from app.models.resolution import AgentCase, ArgumentReview, RuleCheck, Ruling
from app.services.evidence import CaseFacts
from app.services.policy_service import load_policy

_PARTIES = ("rider", "driver")


def rule_support(case: DisputeCase, facts: CaseFacts) -> dict[str, str | None]:
    """Which side each dispute-type rule favours on these facts ("rider", "driver" or None)."""
    if case.type == "route_deviation":
        limit = load_policy()["route_deviation"]["thresholds"]["max_distance_excess_ratio"]
        excess, duration = facts.distance_excess_ratio, facts.duration_excess_ratio
        if excess is None:
            return {"RD-1": None, "RD-2": None, "RD-3": None, "RD-4": None, "RD-5": None}
        from app.agents.judge_agent import longest_stop_min
        detour = excess > limit and (duration is None or duration > 0)
        stop = longest_stop_min(facts)
        min_stop = load_policy()["route_deviation"]["thresholds"]["min_compensation_stop_min"]
        return {
            "RD-1": "driver" if excess <= limit else None,
            "RD-2": "driver" if excess > limit and duration is not None and duration <= 0 else None,
            "RD-3": "rider" if detour else None,
            "RD-4": None,
            "RD-5": "rider" if detour and stop is not None and stop >= min_stop else None,
        }
    thresholds = load_policy()["no_show_charge"]["thresholds"]
    distance, wait = facts.driver_distance_from_pickup_m, facts.driver_wait_min

    def condition(met: bool | None) -> str | None:   # the fee needs every condition met
        return None if met is None else ("driver" if met else "rider")
    return {
        "NS-1": condition(None if distance is None else distance <= thresholds["max_pickup_distance_m"]),
        "NS-2": condition(None if wait is None else wait >= thresholds["min_wait_min"]),
        "NS-3": condition(facts.driver_contact_attempted),
        "NS-4": None,
    }


def review_arguments(case: DisputeCase, facts: CaseFacts, ruling: Ruling,
                     rider_case: AgentCase, driver_case: AgentCase) -> list[ArgumentReview]:
    support = rule_support(case, facts)
    applied = {ref.split(":", 1)[0] for ref in ruling.policy_refs}
    reviews = []
    for party, agent_case in zip(_PARTIES, (rider_case, driver_case)):
        cited = list(dict.fromkeys(ref.split(":", 1)[0] for ref in agent_case.policy_refs))
        checks = []
        for rule in cited:
            side = support.get(rule)
            verdict = "supports" if side == party else "favours_other_side" if side else "does_not_apply"
            checks.append(RuleCheck(rule=rule, verdict=verdict, decisive=rule in applied and side == party))
        rebuttal_ids = agent_case.rebuttal.evidence_ids if agent_case.rebuttal else []
        evidence = len(dict.fromkeys([*agent_case.evidence_ids, *rebuttal_ids]))
        reviews.append(ArgumentReview(party=party, rules=checks, evidence_cited=evidence,
                                      summary=_summary(party, checks, evidence)))
    return reviews


def _summary(party: str, checks: list[RuleCheck], evidence: int) -> str:
    who = party.title()
    cited = f"{evidence} verified fact{'s' if evidence != 1 else ''} cited"
    if not checks:
        return f"{who}: no policy rule cited; argued from the facts ({cited})."
    held = [c.rule for c in checks if c.verdict == "supports"]
    decided = [c.rule for c in checks if c.decisive]
    other = [c.rule for c in checks if c.verdict == "favours_other_side"]
    unused = [c.rule for c in checks if c.verdict == "does_not_apply"]
    parts = []
    if held:
        parts.append(f"{', '.join(held)} {'holds' if len(held) == 1 else 'hold'} in the {party}'s favour"
                     + (f", and {', '.join(decided)} decided the case" if decided else ""))
    if other:
        parts.append(f"{', '.join(other)} {'favours' if len(other) == 1 else 'favour'} the other side")
    if unused:
        parts.append(f"{', '.join(unused)} {'does' if len(unused) == 1 else 'do'} not apply here")
    return f"{who}: " + "; ".join(parts) + f" ({cited})."
