import json

from app.models.dispute import DisputeCase
from app.models.resolution import AgentCase
from app.services.evidence import CaseFacts
from app.agents._advocate import _policy_section, advocate_system_prompt, build_advocate_case

_SYSTEM = advocate_system_prompt("rider", own_account="claim")


def build_rider_case(case: DisputeCase, facts: CaseFacts) -> AgentCase:
    """Argue the rider's side using the rider's claim and the computed facts.

    Calls ``llm_client.complete`` to generate the summary, evidence and policy
    citations. Falls back to a deterministic case (no policy refs) when the
    LLM is offline, raises an HTTP error, or returns unparseable JSON.
    """
    section = _policy_section(case)
    user = json.dumps({
        "rider_claim": case.rider_claim,
        "dispute_type": case.type,
        "facts": facts.describe(),
        "policy_rules": section.get("rules", {}),
    })
    return build_advocate_case(
        agent="rider_advocate",
        system=_SYSTEM,
        user=user,
        claim_line=f"Rider claim: {case.rider_claim}",
        fallback_summary=f"Rider disputes the charge: {case.rider_claim}",
        facts=facts,
        section=section,
    )
